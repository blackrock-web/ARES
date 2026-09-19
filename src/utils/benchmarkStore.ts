import {
  BenchmarkRun,
  BenchmarkEvaluationResult,
  BenchmarkImageItem,
  AggregateStatsForMetric,
  ResourceUsageInfo
} from '../types';
import { ALL_MODEL_ADAPTERS } from './modelAdapters';
import { computeMetricAggregates, detectClientResourceUsage } from './stegoEngine';

type Listener = (run: BenchmarkRun | null) => void;

class BenchmarkStore {
  private currentRun: BenchmarkRun | null = null;
  private listeners: Set<Listener> = new Set();

  constructor() {
    // Optionally load last run from memory if available
  }

  getCurrentRun(): BenchmarkRun | null {
    return this.currentRun;
  }

  setCurrentRun(run: BenchmarkRun) {
    this.currentRun = run;
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentRun);
      } catch (err) {
        console.error('BenchmarkStore listener error:', err);
      }
    });
  }
}

export const benchmarkStore = new BenchmarkStore();

/**
 * Calculate aggregate statistics across successful evaluations for each model
 */
export interface ModelAggregateSummary {
  modelId: string;
  modelName: string;
  totalTested: number;
  successfulCount: number;
  failedCount: number;
  unavailableCount: number;
  recoveryRatePct: number;
  psnr: AggregateStatsForMetric;
  ssim: AggregateStatsForMetric;
  mse: AggregateStatsForMetric;
  encodeTimeMs: AggregateStatsForMetric;
  decodeTimeMs: AggregateStatsForMetric;
}

export function computeRunAggregates(
  results: BenchmarkEvaluationResult[],
  modelIds: string[]
): Record<string, ModelAggregateSummary> {
  const summary: Record<string, ModelAggregateSummary> = {};

  modelIds.forEach((modelId) => {
    const adapter = ALL_MODEL_ADAPTERS.find((a) => a.id === modelId);
    const modelName = adapter ? adapter.name : modelId;
    const modelResults = results.filter((r) => r.modelId === modelId);

    const totalTested = modelResults.length;
    const successful = modelResults.filter((r) => r.status === 'SUCCESS');
    const failed = modelResults.filter((r) => r.status === 'FAILED');
    const unavailable = modelResults.filter((r) => r.status === 'UNAVAILABLE' || r.status === 'NOT_EXECUTED');

    const successfulRecoveries = successful.filter((r) => r.recovery.status === 'PASS').length;
    const recoveryRatePct = totalTested > 0 ? (successfulRecoveries / totalTested) * 100 : 0;

    // Only compute aggregates on successful numerical executions
    const psnrValues = successful.map((r) => r.metrics.psnr).filter((v): v is number => v !== null);
    const ssimValues = successful.map((r) => r.metrics.ssim).filter((v): v is number => v !== null);
    const mseValues = successful.map((r) => r.metrics.mse).filter((v): v is number => v !== null);
    const encodeValues = successful.map((r) => r.encoding.timeMs).filter((v): v is number => v !== null);
    const decodeValues = successful.map((r) => r.decoding.timeMs).filter((v): v is number => v !== null);

    summary[modelId] = {
      modelId,
      modelName,
      totalTested,
      successfulCount: successful.length,
      failedCount: failed.length,
      unavailableCount: unavailable.length,
      recoveryRatePct: Math.round(recoveryRatePct * 10) / 10,
      psnr: computeMetricAggregates(psnrValues),
      ssim: computeMetricAggregates(ssimValues),
      mse: computeMetricAggregates(mseValues),
      encodeTimeMs: computeMetricAggregates(encodeValues),
      decodeTimeMs: computeMetricAggregates(decodeValues)
    };
  });

  return summary;
}

/**
 * Metric-specific best model finder (no arbitrary universal composite)
 * Returns 'Tie' or 'No valid comparison' when appropriate
 */
export function findBestMetricPerformers(
  aggregates: Record<string, ModelAggregateSummary>
): {
  highestPsnr: string;
  highestSsim: string;
  lowestMse: string;
  fastestEncoding: string;
  successfulRecovery: string;
} {
  const models = Object.values(aggregates).filter((m) => m.successfulCount > 0);

  if (models.length === 0) {
    return {
      highestPsnr: 'No valid comparison',
      highestSsim: 'No valid comparison',
      lowestMse: 'No valid comparison',
      fastestEncoding: 'No valid comparison',
      successfulRecovery: 'No valid comparison'
    };
  }

  // Highest PSNR
  const maxPsnr = Math.max(...models.map((m) => m.psnr.mean));
  const psnrWinners = models.filter((m) => Math.abs(m.psnr.mean - maxPsnr) < 0.0001);
  const highestPsnr =
    psnrWinners.length > 1
      ? `Tie (${psnrWinners.map((w) => w.modelName.split(' ')[0]).join(', ')})`
      : `${psnrWinners[0].modelName} (${psnrWinners[0].psnr.mean.toFixed(2)} dB)`;

  // Highest SSIM
  const maxSsim = Math.max(...models.map((m) => m.ssim.mean));
  const ssimWinners = models.filter((m) => Math.abs(m.ssim.mean - maxSsim) < 0.000001);
  const highestSsim =
    ssimWinners.length > 1
      ? `Tie (${ssimWinners.map((w) => w.modelName.split(' ')[0]).join(', ')})`
      : `${ssimWinners[0].modelName} (${ssimWinners[0].ssim.mean.toFixed(6)})`;

  // Lowest MSE
  const minMse = Math.min(...models.map((m) => m.mse.mean));
  const mseWinners = models.filter((m) => Math.abs(m.mse.mean - minMse) < 0.000001);
  const lowestMse =
    mseWinners.length > 1
      ? `Tie (${mseWinners.map((w) => w.modelName.split(' ')[0]).join(', ')})`
      : `${mseWinners[0].modelName} (${mseWinners[0].mse.mean.toFixed(5)})`;

  // Fastest Encoding
  const minEncode = Math.min(...models.map((m) => m.encodeTimeMs.mean));
  const encodeWinners = models.filter((m) => Math.abs(m.encodeTimeMs.mean - minEncode) < 0.01);
  const fastestEncoding =
    encodeWinners.length > 1
      ? `Tie (${encodeWinners.map((w) => w.modelName.split(' ')[0]).join(', ')})`
      : `${encodeWinners[0].modelName} (${encodeWinners[0].encodeTimeMs.mean.toFixed(1)} ms)`;

  // Successful Payload Recovery
  const fullRecoveryModels = models.filter((m) => m.recoveryRatePct >= 100);
  const successfulRecovery =
    fullRecoveryModels.length > 0
      ? fullRecoveryModels.map((m) => m.modelName.split(' ')[0]).join(', ') + ' (100%)'
      : 'None (0%)';

  return {
    highestPsnr,
    highestSsim,
    lowestMse,
    fastestEncoding,
    successfulRecovery
  };
}

/**
 * Generate formatted timestamp string: YYYY-MM-DD_HHMMSS
 */
export function getFormattedTimestamp(date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${m}-${d}_${h}${min}${s}`;
}

/**
 * Export JSON strictly according to Requirement #18 & #21
 * - Does NOT include plaintext passphrase
 * - Keeps nulls for failed metrics
 * - Contains reproducibility metadata
 */
export function exportBenchmarkRunJSON(run: BenchmarkRun) {
  const filename = `ARES_benchmark_${getFormattedTimestamp(new Date(run.timestamp))}.json`;

  const exportData = {
    benchmark: {
      run_id: run.runId,
      timestamp: run.timestamp,
      source: run.source,
      application_version: '5.0.0 (Hybrid-INN)',
      framework: 'ARES Universal Steganography Benchmark',
      images_tested: run.images.length,
      models_tested: run.modelIds.length,
      evaluations_total: run.results.length,
      evaluations_successful: run.summary.successful,
      evaluations_failed: run.summary.failed,
      evaluations_unavailable: run.summary.unavailable
    },
    reproducibility_metadata: {
      device: run.config.deviceContext.device,
      gpu_model: run.config.deviceContext.gpuModel,
      cpu_threads: run.config.deviceContext.cpuUsage,
      memory_heap: run.config.deviceContext.ramUsage,
      payload_type: run.config.payloadType,
      payload_size_bytes: run.config.payloadSizeBytes,
      passphrase_authenticated: run.config.passphraseProvided,
      security_evaluated: run.config.evaluateSecurity,
      note: 'Passphrase plaintext is intentionally excluded for security compliance.'
    },
    models: run.modelIds.map((mId) => {
      const adapter = ALL_MODEL_ADAPTERS.find((a) => a.id === mId);
      return {
        model_id: mId,
        name: adapter?.name || mId,
        type: adapter?.type || 'paper',
        slot: adapter?.slot || mId,
        supports_gpu: adapter?.supportsGPU || false,
        available: adapter?.isAvailable || false
      };
    }),
    images: run.images.map((img) => ({
      image_id: img.id,
      name: img.name,
      width: img.width,
      height: img.height,
      is_custom: img.isCustom || false
    })),
    results: run.results.map((r) => ({
      image_id: r.imageId,
      image_name: r.imageName,
      model: r.modelId,
      model_name: r.modelName,
      status: r.status,
      reason: r.reason || null,
      error: r.error || null,
      metrics: {
        psnr: r.metrics.psnr,
        ssim: r.metrics.ssim,
        mse: r.metrics.mse,
        bpp: r.metrics.bpp,
        capacity_bytes: r.metrics.capacityBytes,
        payload_utilization_pct: r.metrics.payloadUtilizationPct
      },
      payload: {
        size_bytes: r.payload.sizeBytes,
        type: r.payload.type
      },
      encoding: {
        time_ms: r.encoding.timeMs,
        time_seconds: r.encoding.timeSeconds
      },
      decoding: {
        time_ms: r.decoding.timeMs,
        time_seconds: r.decoding.timeSeconds
      },
      recovery: {
        status: r.recovery.status,
        exact_match: r.recovery.exactMatch,
        ber: r.recovery.ber,
        recovered_size: r.recovery.recoveredSize
      },
      steganalysis: r.steganalysis
        ? {
            verdict: r.steganalysis.detectionVerdict,
            stego_detect_prob: r.steganalysis.stegoDetectProb,
            cover_detect_prob: r.steganalysis.coverDetectProb,
            p_value: r.steganalysis.pValue
          }
        : null
    }))
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export CSV strictly according to Requirement #19 & #20
 * Header: image,model,status,psnr,ssim,mse,payload_bytes,encode_seconds,decode_seconds,recovery,exact_match,error
 * Empty string for unavailable/null metrics (never fake zeroes)
 */
export function exportBenchmarkRunCSV(run: BenchmarkRun) {
  const filename = `ARES_benchmark_${getFormattedTimestamp(new Date(run.timestamp))}.csv`;

  const headers = [
    'image',
    'model',
    'status',
    'psnr',
    'ssim',
    'mse',
    'payload_bytes',
    'encode_seconds',
    'decode_seconds',
    'recovery',
    'exact_match',
    'error'
  ];

  const rows = run.results.map((r) => [
    `"${r.imageName}"`,
    `"${r.modelName}"`,
    r.status,
    r.metrics.psnr !== null ? r.metrics.psnr.toFixed(4) : '',
    r.metrics.ssim !== null ? r.metrics.ssim.toFixed(6) : '',
    r.metrics.mse !== null ? r.metrics.mse.toFixed(6) : '',
    r.payload.sizeBytes,
    r.encoding.timeSeconds !== null ? r.encoding.timeSeconds.toFixed(4) : '',
    r.decoding.timeSeconds !== null ? r.decoding.timeSeconds.toFixed(4) : '',
    r.recovery.status,
    r.recovery.exactMatch ? 'TRUE' : 'FALSE',
    r.error ? `"${r.error.replace(/"/g, '""')}"` : r.reason ? `"${r.reason.replace(/"/g, '""')}"` : ''
  ]);

  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
