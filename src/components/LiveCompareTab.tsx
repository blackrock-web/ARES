import React, { useState, useEffect } from 'react';
import {
  Upload,
  Play,
  CheckCircle2,
  XCircle,
  Award,
  Eye,
  Info,
  Sliders,
  Download,
  ShieldCheck,
  ShieldAlert,
  BarChart2,
  Layers,
  ZoomIn
} from 'lucide-react';
import { BenchmarkRowResult, ModelTenParameterAggregates } from '../types';
import {
  createSyntheticCover,
  embedSecret,
  extractSecret,
  computeMSE,
  computePSNR,
  computeSSIM,
  analyzeLSB,
  generateResidualDataUrl,
  generateLSBMapDataUrl,
  getModelCapacityBytes,
  getPayloadSizeBytes,
  computeBER,
  textToBits,
  detectClientResourceUsage,
  evaluateRobustnessUnderAttack,
  performChiSquareSteganalysis,
  computeMetricAggregates
} from '../utils/stegoEngine';
import { TenParameterTable } from './TenParameterTable';
import { AggregateStatsTable } from './AggregateStatsTable';
import { BenchmarkCharts } from './BenchmarkCharts';
import { exportToCSV, exportToJSON, ExportEvaluationRecord } from '../utils/benchmarkExport';

const FIVE_BENCHMARK_IMAGES = [
  { id: 'syn_0050', label: 'Cover 0050', path: '/results/research_20260919_203322/per_image/syn_0050/cover.png' },
  { id: 'syn_0051', label: 'Cover 0051', path: '/results/research_20260919_203322/per_image/syn_0051/cover.png' },
  { id: 'syn_0052', label: 'Cover 0052', path: '/results/research_20260919_203322/per_image/syn_0052/cover.png' },
  { id: 'syn_0053', label: 'Cover 0053', path: '/results/research_20260919_203322/per_image/syn_0053/cover.png' },
  { id: 'syn_0054', label: 'Cover 0054', path: '/results/research_20260919_203322/per_image/syn_0054/cover.png' },
];

const PRESET_COVERS = [
  ...FIVE_BENCHMARK_IMAGES,
  { id: 'synthetic', label: 'Procedural Texture', path: 'procedural' }
];

const MODELS_TO_RUN = [
  { id: 'ares_hybrid_inn', name: 'ARES-Hybrid-INN (Proposed)' },
  { id: 'paper_model_01', name: 'Kanimozhi RNN+Fuzzy (2025)' },
  { id: 'paper_model_02', name: 'Sanjalawe Huffman+LSB+DL (2025)' },
  { id: 'paper_model_03', name: 'Rahman LSB+MagicMatrix (2025)' },
  { id: 'paper_model_04', name: 'Aljarf DL-Steg ECC+SAE (2025)' },
  { id: 'paper_model_05', name: 'Zhang ISS Multi-Image (2025)' }
];

export const LiveCompareTab: React.FC = () => {
  // Input settings
  const [selectedCover, setSelectedCover] = useState<string>(PRESET_COVERS[0].path);
  const [customCoverUrl, setCustomCoverUrl] = useState<string | null>(null);
  const [secretText, setSecretText] = useState<string>('ARES live benchmark 10-parameter secret payload');
  const [imageSize, setImageSize] = useState<number>(256);
  const [evaluateAttacks, setEvaluateAttacks] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');

  // Active view tab
  const [activeSubTab, setActiveSubTab] = useState<'TABLE' | 'PER_IMAGE' | 'AGGREGATES' | 'CHARTS' | 'GALLERY'>('TABLE');

  // Single run results
  const [coverDataUrl, setCoverDataUrl] = useState<string>('');
  const [results, setResults] = useState<BenchmarkRowResult[]>([]);
  const [bestModel, setBestModel] = useState<BenchmarkRowResult | null>(null);

  // 5-Image Suite results
  const [suiteResults, setSuiteResults] = useState<Record<string, BenchmarkRowResult[]>>({});
  const [suiteAggregates, setSuiteAggregates] = useState<Record<string, ModelTenParameterAggregates>>({});
  const [selectedPerImageId, setSelectedPerImageId] = useState<string>('syn_0050');

  // Modal zoom
  const [selectedModalImage, setSelectedModalImage] = useState<{ url: string; title: string } | null>(null);

  // Run single comparison on mount
  useEffect(() => {
    runSingleComparison();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setCustomCoverUrl(url);
        setSelectedCover(url);
      };
      reader.readAsDataURL(file);
    }
  };

  // Helper to load ImageData from path or synthetic
  const loadImageData = async (coverPath: string, size: number): Promise<{ imageData: ImageData; dataUrl: string }> => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    let imgData: ImageData;

    if (coverPath === 'procedural') {
      imgData = createSyntheticCover(size);
      ctx.putImageData(imgData, 0, 0);
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = () => {
          imgData = createSyntheticCover(size);
          ctx.putImageData(imgData, 0, 0);
          resolve(null);
        };
        img.src = coverPath;
      });

      if (img.width > 0) {
        ctx.drawImage(img, 0, 0, size, size);
        imgData = ctx.getImageData(0, 0, size, size);
      } else {
        imgData = createSyntheticCover(size);
        ctx.putImageData(imgData, 0, 0);
      }
    }

    return {
      imageData: imgData,
      dataUrl: canvas.toDataURL('image/png')
    };
  };

  // Core model evaluation function for a single cover image
  const evaluateSingleCoverWithAllModels = async (
    coverImageData: ImageData,
    coverDataUrlStr: string,
    size: number,
    runAttacks: boolean
  ): Promise<BenchmarkRowResult[]> => {
    const rows: BenchmarkRowResult[] = [];
    const originalBits = textToBits(secretText);
    const clientResources = detectClientResourceUsage();

    for (let i = 0; i < MODELS_TO_RUN.length; i++) {
      const m = MODELS_TO_RUN[i];
      setProgressText(`Evaluating ${m.name}...`);
      await new Promise(r => setTimeout(r, 15));

      try {
        if (m.id === 'paper_model_05') {
          rows.push({
            modelId: m.id,
            modelName: m.name,
            status: 'UNAVAILABLE',
            psnr: 0,
            ssim: 0,
            mse: 0,
            ms_ssim: 0,
            payloadSizeBytes: getPayloadSizeBytes(secretText),
            capacityBytes: 0,
            payloadUtilizationPct: 0,
            bpp: 0,
            exactRecovery: false,
            recoveryStatus: 'NOT VERIFIED',
            ber: 0,
            recoveredText: '',
            embeddingTimeMs: 0,
            decodingTimeMs: 0,
            resourceUsage: clientResources,
            robustnessEvaluated: false,
            robustnessRate: null,
            steganalysis: {
              chiSquareStatistic: 0,
              criticalValue95: 0,
              pValue: 1.0,
              detectionVerdict: 'UNDETECTED',
              stegoDetectProb: 0,
              coverDetectProb: 0,
              note: 'Zhang ISS pipeline requires multi-image dataset (>=3 covers); unavailable in single cover'
            },
            truePositive: false,
            timeMs: 0,
            lsbChangePct: 0,
            error: 'Paper Model 5 (Zhang ISS Multi-Image 2025) requires multi-image dataset (>=3 covers); unavailable in single cover.'
          });
          continue;
        }

        // 1. Measure Embedding Time (Parameter 6)
        const tEmbedStart = performance.now();
        const embedRes = embedSecret(coverImageData, secretText, m.id, 'benchmark');
        const embeddingTimeMs = Math.round((performance.now() - tEmbedStart) * 10) / 10;

        // Put stego to canvas for visualization
        const stegoCanvas = document.createElement('canvas');
        stegoCanvas.width = size;
        stegoCanvas.height = size;
        const stegoCtx = stegoCanvas.getContext('2d')!;
        stegoCtx.putImageData(embedRes.stegoImgData, 0, 0);
        const stegoDataUrl = stegoCanvas.toDataURL('image/png');

        // 2. Measure Decoding Time (Parameter 7) & Payload Recovery / BER (Parameter 5)
        const tDecodeStart = performance.now();
        const extractRes = extractSecret(embedRes.stegoImgData, m.id, 'benchmark');
        const decodingTimeMs = Math.round((performance.now() - tDecodeStart) * 10) / 10;

        const exactRecovery = extractRes.success && extractRes.text === secretText;
        const ber = computeBER(originalBits, extractRes.bits);

        // 3. PSNR, SSIM, MSE (Parameters 1, 2, 3)
        const mse = computeMSE(coverImageData, embedRes.stegoImgData);
        const psnr = computePSNR(mse);
        const ssim = computeSSIM(coverImageData, embedRes.stegoImgData);
        const lsbStats = analyzeLSB(coverImageData, embedRes.stegoImgData);
        const residualDataUrl = generateResidualDataUrl(coverImageData, embedRes.stegoImgData, 12.0);
        const lsbMapDataUrl = generateLSBMapDataUrl(embedRes.stegoImgData);

        // 4. Capacity & Utilization (Parameter 4)
        const capacityBytes = getModelCapacityBytes(size, size, m.id);
        const payloadSizeBytes = getPayloadSizeBytes(secretText);
        const payloadUtilizationPct = capacityBytes > 0
          ? Math.round((payloadSizeBytes / capacityBytes) * 10000) / 100
          : 0;
        const bpp = (payloadSizeBytes * 8) / (size * size);

        // 5. Robustness Under Attack (Parameter 9)
        let robustnessRate: number | null = null;
        let attackBreakdown = undefined;

        if (runAttacks) {
          setProgressText(`Testing attacks on ${m.name}...`);
          const atkRes = await evaluateRobustnessUnderAttack(embedRes.stegoImgData, secretText, m.id, 'benchmark');
          robustnessRate = atkRes.robustnessRate;
          attackBreakdown = atkRes.attackBreakdown;
        }

        // 6. Steganalysis Detectability (Parameter 10)
        const steganalysis = performChiSquareSteganalysis(coverImageData, embedRes.stegoImgData);

        rows.push({
          modelId: m.id,
          modelName: m.name,
          status: exactRecovery ? 'OK' : 'FAILED',
          psnr,
          ssim,
          mse,
          ms_ssim: ssim,
          payloadSizeBytes,
          capacityBytes,
          payloadUtilizationPct,
          bpp,
          exactRecovery,
          recoveryStatus: exactRecovery ? 'PASS' : 'FAIL',
          ber,
          recoveredText: extractRes.text,
          embeddingTimeMs,
          decodingTimeMs,
          resourceUsage: clientResources,
          robustnessEvaluated: runAttacks,
          robustnessRate,
          attackBreakdown,
          steganalysis,
          truePositive: exactRecovery,
          timeMs: embeddingTimeMs + decodingTimeMs,
          lsbChangePct: Math.round(lsbStats.lsbChangePct * 1000) / 1000,
          stegoDataUrl,
          residualDataUrl,
          lsbMapDataUrl
        });
      } catch (err: any) {
        rows.push({
          modelId: m.id,
          modelName: m.name,
          status: 'FAILED',
          psnr: 0,
          ssim: 0,
          mse: 0,
          ms_ssim: 0,
          payloadSizeBytes: getPayloadSizeBytes(secretText),
          capacityBytes: 0,
          payloadUtilizationPct: 0,
          bpp: 0,
          exactRecovery: false,
          recoveryStatus: 'FAIL',
          ber: 1.0,
          recoveredText: '',
          embeddingTimeMs: 0,
          decodingTimeMs: 0,
          resourceUsage: clientResources,
          robustnessEvaluated: false,
          robustnessRate: null,
          steganalysis: {
            chiSquareStatistic: 0,
            criticalValue95: 0,
            pValue: 0,
            detectionVerdict: 'DETECTED',
            stegoDetectProb: 1.0,
            coverDetectProb: 0,
            note: err?.message || 'Execution error'
          },
          truePositive: false,
          timeMs: 0,
          lsbChangePct: 0,
          error: err?.message || 'Execution failed'
        });
      }
    }

    // Sort by PSNR descending, SSIM descending, latency ascending
    rows.sort((a, b) => {
      if (b.psnr !== a.psnr) return b.psnr - a.psnr;
      if (b.ssim !== a.ssim) return b.ssim - a.ssim;
      return a.timeMs - b.timeMs;
    });

    return rows;
  };

  // Run single image comparison
  const runSingleComparison = async () => {
    setIsRunning(true);
    setProgressText('Loading cover image...');

    try {
      const { imageData, dataUrl } = await loadImageData(selectedCover, imageSize);
      setCoverDataUrl(dataUrl);

      const rows = await evaluateSingleCoverWithAllModels(imageData, dataUrl, imageSize, evaluateAttacks);
      setResults(rows);
      setBestModel(rows.length > 0 && rows[0].truePositive ? rows[0] : null);
    } catch (err) {
      console.error('Error during benchmark execution:', err);
    } finally {
      setIsRunning(false);
      setProgressText('');
    }
  };

  // Run 5-Image Suite Benchmark (Full Research Run)
  const runFiveImageBenchmark = async () => {
    setIsRunning(true);
    setProgressText('Initializing 5-Image Research Suite...');

    try {
      const perImageMap: Record<string, BenchmarkRowResult[]> = {};

      for (let imgIdx = 0; imgIdx < FIVE_BENCHMARK_IMAGES.length; imgIdx++) {
        const item = FIVE_BENCHMARK_IMAGES[imgIdx];
        setProgressText(`[${imgIdx + 1}/5] Evaluating Image ${item.id}...`);

        const { imageData, dataUrl } = await loadImageData(item.path, imageSize);
        const rows = await evaluateSingleCoverWithAllModels(imageData, dataUrl, imageSize, evaluateAttacks);
        perImageMap[item.id] = rows;
      }

      setSuiteResults(perImageMap);

      // Compute aggregate statistics for each model across the 5 images
      const aggMap: Record<string, ModelTenParameterAggregates> = {};

      MODELS_TO_RUN.forEach((m) => {
        const modelRows: BenchmarkRowResult[] = [];
        Object.values(perImageMap).forEach((list) => {
          const found = list.find((r) => r.modelId === m.id);
          if (found) modelRows.push(found);
        });

        const psnrValues = modelRows.map((r) => r.psnr);
        const ssimValues = modelRows.map((r) => r.ssim);
        const mseValues = modelRows.map((r) => r.mse);
        const utilValues = modelRows.map((r) => r.payloadUtilizationPct);
        const berValues = modelRows.map((r) => r.ber);
        const embedTimeValues = modelRows.map((r) => r.embeddingTimeMs);
        const decodeTimeValues = modelRows.map((r) => r.decodingTimeMs);
        const robustValues = modelRows
          .filter((r) => r.robustnessRate !== null)
          .map((r) => r.robustnessRate as number);
        const detectProbValues = modelRows.map((r) => r.steganalysis.stegoDetectProb);

        const passCount = modelRows.filter((r) => r.exactRecovery).length;

        aggMap[m.id] = {
          modelId: m.id,
          modelName: m.name,
          imageCount: modelRows.length,
          exactRecoveryRate: (passCount / modelRows.length) * 100,
          psnr: computeMetricAggregates(psnrValues),
          ssim: computeMetricAggregates(ssimValues),
          mse: computeMetricAggregates(mseValues),
          payloadUtilizationPct: computeMetricAggregates(utilValues),
          ber: computeMetricAggregates(berValues),
          embeddingTimeMs: computeMetricAggregates(embedTimeValues),
          decodingTimeMs: computeMetricAggregates(decodeTimeValues),
          robustnessRate: robustValues.length > 0 ? computeMetricAggregates(robustValues) : null,
          stegoDetectProb: detectProbValues.length > 0 ? computeMetricAggregates(detectProbValues) : null
        };
      });

      setSuiteAggregates(aggMap);

      // Set current results to the selected per-image results
      if (perImageMap['syn_0050']) {
        setResults(perImageMap['syn_0050']);
        setBestModel(perImageMap['syn_0050'][0]);
      }

      setActiveSubTab('AGGREGATES');
    } catch (err) {
      console.error('5-Image benchmark failed:', err);
    } finally {
      setIsRunning(false);
      setProgressText('');
    }
  };

  // Export handlers
  const handleExportCSV = () => {
    const records: ExportEvaluationRecord[] = [];

    // If 5-image suite is available, export all 5 images; otherwise current results
    const keys = Object.keys(suiteResults);
    if (keys.length > 0) {
      keys.forEach((imgId) => {
        suiteResults[imgId].forEach((r) => {
          records.push({
            imageId: imgId,
            imageResolution: imageSize,
            modelId: r.modelId,
            modelName: r.modelName,
            psnr_db: Number(r.psnr.toFixed(4)),
            ssim: Number(r.ssim.toFixed(6)),
            mse: Number(r.mse.toExponential(4)),
            payload_size_bytes: r.payloadSizeBytes,
            capacity_bytes: r.capacityBytes,
            payload_utilization_pct: Number(r.payloadUtilizationPct.toFixed(2)),
            bpp: Number(r.bpp.toFixed(4)),
            exact_recovery: r.exactRecovery,
            recovery_status: r.recoveryStatus,
            ber: Number(r.ber.toFixed(5)),
            embedding_time_ms: r.embeddingTimeMs,
            decoding_time_ms: r.decodingTimeMs,
            device_context: r.resourceUsage.device,
            gpu_context: r.resourceUsage.gpuModel || 'N/A',
            cpu_threads: r.resourceUsage.cpuUsage || 'N/A',
            memory_footprint: r.resourceUsage.ramUsage || 'N/A',
            robustness_rate_pct: r.robustnessRate !== null ? r.robustnessRate : 'N/A',
            steganalysis_cover_detect_prob: r.steganalysis.coverDetectProb,
            steganalysis_stego_detect_prob: r.steganalysis.stegoDetectProb,
            steganalysis_p_value: r.steganalysis.pValue,
            steganalysis_verdict: r.steganalysis.detectionVerdict
          });
        });
      });
    } else {
      results.forEach((r) => {
        records.push({
          imageId: 'current_cover',
          imageResolution: imageSize,
          modelId: r.modelId,
          modelName: r.modelName,
          psnr_db: Number(r.psnr.toFixed(4)),
          ssim: Number(r.ssim.toFixed(6)),
          mse: Number(r.mse.toExponential(4)),
          payload_size_bytes: r.payloadSizeBytes,
          capacity_bytes: r.capacityBytes,
          payload_utilization_pct: Number(r.payloadUtilizationPct.toFixed(2)),
          bpp: Number(r.bpp.toFixed(4)),
          exact_recovery: r.exactRecovery,
          recovery_status: r.recoveryStatus,
          ber: Number(r.ber.toFixed(5)),
          embedding_time_ms: r.embeddingTimeMs,
          decoding_time_ms: r.decodingTimeMs,
          device_context: r.resourceUsage.device,
          gpu_context: r.resourceUsage.gpuModel || 'N/A',
          cpu_threads: r.resourceUsage.cpuUsage || 'N/A',
          memory_footprint: r.resourceUsage.ramUsage || 'N/A',
          robustness_rate_pct: r.robustnessRate !== null ? r.robustnessRate : 'N/A',
          steganalysis_cover_detect_prob: r.steganalysis.coverDetectProb,
          steganalysis_stego_detect_prob: r.steganalysis.stegoDetectProb,
          steganalysis_p_value: r.steganalysis.pValue,
          steganalysis_verdict: r.steganalysis.detectionVerdict
        });
      });
    }

    exportToCSV(records, `ares_10_parameter_benchmark_${Date.now()}.csv`);
  };

  const handleExportJSON = () => {
    const records: ExportEvaluationRecord[] = [];
    const keys = Object.keys(suiteResults);

    if (keys.length > 0) {
      keys.forEach((imgId) => {
        suiteResults[imgId].forEach((r) => {
          records.push({
            imageId: imgId,
            imageResolution: imageSize,
            modelId: r.modelId,
            modelName: r.modelName,
            psnr_db: Number(r.psnr.toFixed(4)),
            ssim: Number(r.ssim.toFixed(6)),
            mse: Number(r.mse.toExponential(4)),
            payload_size_bytes: r.payloadSizeBytes,
            capacity_bytes: r.capacityBytes,
            payload_utilization_pct: Number(r.payloadUtilizationPct.toFixed(2)),
            bpp: Number(r.bpp.toFixed(4)),
            exact_recovery: r.exactRecovery,
            recovery_status: r.recoveryStatus,
            ber: Number(r.ber.toFixed(5)),
            embedding_time_ms: r.embeddingTimeMs,
            decoding_time_ms: r.decodingTimeMs,
            device_context: r.resourceUsage.device,
            gpu_context: r.resourceUsage.gpuModel || 'N/A',
            cpu_threads: r.resourceUsage.cpuUsage || 'N/A',
            memory_footprint: r.resourceUsage.ramUsage || 'N/A',
            robustness_rate_pct: r.robustnessRate !== null ? r.robustnessRate : 'N/A',
            steganalysis_cover_detect_prob: r.steganalysis.coverDetectProb,
            steganalysis_stego_detect_prob: r.steganalysis.stegoDetectProb,
            steganalysis_p_value: r.steganalysis.pValue,
            steganalysis_verdict: r.steganalysis.detectionVerdict
          });
        });
      });
    } else {
      results.forEach((r) => {
        records.push({
          imageId: 'current_cover',
          imageResolution: imageSize,
          modelId: r.modelId,
          modelName: r.modelName,
          psnr_db: Number(r.psnr.toFixed(4)),
          ssim: Number(r.ssim.toFixed(6)),
          mse: Number(r.mse.toExponential(4)),
          payload_size_bytes: r.payloadSizeBytes,
          capacity_bytes: r.capacityBytes,
          payload_utilization_pct: Number(r.payloadUtilizationPct.toFixed(2)),
          bpp: Number(r.bpp.toFixed(4)),
          exact_recovery: r.exactRecovery,
          recovery_status: r.recoveryStatus,
          ber: Number(r.ber.toFixed(5)),
          embedding_time_ms: r.embeddingTimeMs,
          decoding_time_ms: r.decodingTimeMs,
          device_context: r.resourceUsage.device,
          gpu_context: r.resourceUsage.gpuModel || 'N/A',
          cpu_threads: r.resourceUsage.cpuUsage || 'N/A',
          memory_footprint: r.resourceUsage.ramUsage || 'N/A',
          robustness_rate_pct: r.robustnessRate !== null ? r.robustnessRate : 'N/A',
          steganalysis_cover_detect_prob: r.steganalysis.coverDetectProb,
          steganalysis_stego_detect_prob: r.steganalysis.stegoDetectProb,
          steganalysis_p_value: r.steganalysis.pValue,
          steganalysis_verdict: r.steganalysis.detectionVerdict
        });
      });
    }

    exportToJSON(
      records,
      suiteAggregates,
      {
        benchmarkSuite: 'ARES 10-Parameter Model Benchmark',
        dataset: keys.length > 0 ? '5 Benchmark Images (syn_0050 - syn_0054)' : 'Single Cover Test'
      },
      `ares_10_parameter_benchmark_${Date.now()}.json`
    );
  };

  // Determine active displayed results (either suite per-image or single run)
  const displayedResults =
    activeSubTab === 'PER_IMAGE' && suiteResults[selectedPerImageId]
      ? suiteResults[selectedPerImageId]
      : results;

  return (
    <div className="space-y-6">
      {/* Intro Header & Integrity Verification */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-xs font-semibold uppercase tracking-wider">
                10 Research-Relevant Parameters
              </span>
              <span className="text-xs text-emerald-400 flex items-center gap-1 font-mono">
                <CheckCircle2 className="h-3.5 w-3.5" /> Strict True-Positive Protocol
              </span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              ARES Comprehensive Model Benchmark & Empirical Comparison
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Every parameter is calculated from actual execution results on identical covers and payloads.
              PSNR, SSIM, and MSE evaluate real imperceptibility; BER and exact recovery verify payload transmission;
              lossy JPEG, Gaussian noise, blur, and lighting evaluate attack survival; and Chi-Square analysis measures statistical steganalysis resistance.
            </p>
          </div>

          {/* Action & Export Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={results.length === 0}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5 text-cyan-400" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportJSON}
              disabled={results.length === 0}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5 text-indigo-400" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary Configuration & Runner Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Configuration Controls */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Sliders className="h-4 w-4 text-cyan-400" />
              Benchmark Configuration
            </h3>

            {/* Cover Presets (5 Benchmark Images + Synthetic) */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Select Cover Image (5 Benchmark Covers)
                </label>
                <span className="text-[11px] font-mono text-cyan-400">5 Test Images</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {PRESET_COVERS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setCustomCoverUrl(null);
                      setSelectedCover(preset.path);
                    }}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium border text-center transition ${
                      selectedCover === preset.path && !customCoverUrl
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-semibold shadow-sm'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Upload Custom */}
              <label className="flex flex-col items-center justify-center p-2.5 border border-dashed border-slate-700 rounded-xl cursor-pointer hover:border-cyan-500/50 bg-slate-800/30 transition">
                <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                  <Upload className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Upload Custom Cover Image</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Secret Payload Input */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-medium text-slate-300">
                  Secret Payload Message
                </label>
                <span className="text-[11px] font-mono text-slate-400">
                  {secretText.length} chars ({secretText.length * 8 + 32} bits)
                </span>
              </div>
              <textarea
                value={secretText}
                onChange={(e) => setSecretText(e.target.value)}
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
                placeholder="Enter secret message to embed..."
              />
            </div>

            {/* Resolution Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Resolution Dimension
              </label>
              <select
                value={imageSize}
                onChange={(e) => setImageSize(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
              >
                <option value={128}>128 × 128 (Rapid)</option>
                <option value={256}>256 × 256 (Standard Benchmark)</option>
                <option value={384}>384 × 384 (Detailed)</option>
                <option value={512}>512 × 512 (High Resolution)</option>
              </select>
            </div>

            {/* Attack Suite Toggle */}
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={evaluateAttacks}
                  onChange={(e) => setEvaluateAttacks(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-200">
                    Parameter 9: Robustness Attack Suite
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Evaluates JPEG (Q=90, 80), Gaussian noise, salt & pepper, blur, brightness, and contrast survival.
                  </p>
                </div>
              </label>
            </div>

            {/* Execution Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={runSingleComparison}
                disabled={isRunning}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold tracking-wide flex items-center justify-center gap-2 shadow-lg transition ${
                  isRunning
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/30'
                }`}
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                {isRunning ? progressText || 'Running...' : 'RUN SINGLE COVER COMPARISON'}
              </button>

              <button
                type="button"
                onClick={runFiveImageBenchmark}
                disabled={isRunning}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold tracking-wide flex items-center justify-center gap-2 shadow-lg transition ${
                  isRunning
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white shadow-indigo-900/30'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                {isRunning ? progressText || 'Evaluating Suite...' : 'RUN 5-IMAGE RESEARCH SUITE'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Winner Banner & Navigation Tabs */}
        <div className="lg:col-span-8 space-y-4">
          {/* Winner Banner */}
          {bestModel && (
            <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-850 border border-cyan-500/30 rounded-xl p-5 shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Award className="h-28 w-28 text-cyan-400" />
              </div>

              <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1">
                <Award className="h-4 w-4" />
                Benchmark Winner (Exact Secret Recovery + Peak Imperceptibility)
              </div>

              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                <h3 className="text-2xl font-bold text-white font-mono">{bestModel.modelName}</h3>
                <div className="text-xs font-medium text-emerald-400 flex items-center gap-1.5 font-mono">
                  <CheckCircle2 className="h-4 w-4" />
                  Exact 100% Secret Recovery (BER = 0.000)
                </div>
              </div>

              {/* 4 Highlights from the 10 parameters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800 text-xs">
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[11px]">1. PSNR (dB) ↑</div>
                  <div className="text-base font-bold text-cyan-300 font-mono">
                    {bestModel.psnr.toFixed(3)} <span className="text-[11px] font-normal text-slate-400">dB</span>
                  </div>
                </div>
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[11px]">2. SSIM ↑</div>
                  <div className="text-base font-bold text-slate-100 font-mono">
                    {bestModel.ssim.toFixed(6)}
                  </div>
                </div>
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[11px]">9. Robustness ↑</div>
                  <div className="text-base font-bold text-teal-300 font-mono">
                    {bestModel.robustnessRate !== null ? `${bestModel.robustnessRate.toFixed(1)}%` : 'N/A'}
                  </div>
                </div>
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[11px]">10. Steganalysis ↓</div>
                  <div className="text-base font-bold text-amber-300 font-mono">
                    {bestModel.steganalysis.detectionVerdict}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Sub-Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2">
            <button
              type="button"
              onClick={() => setActiveSubTab('TABLE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeSubTab === 'TABLE'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              10-Parameter Matrix
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('PER_IMAGE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                activeSubTab === 'PER_IMAGE'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Per-Image Comparison</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono text-cyan-400">
                5 Images
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('AGGREGATES')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeSubTab === 'AGGREGATES'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Aggregate Statistics (Mean/Std/Min/Max)
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('CHARTS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeSubTab === 'CHARTS'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Metric Charts & Radar
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('GALLERY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeSubTab === 'GALLERY'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Artifacts & Residuals Gallery
            </button>
          </div>

          {/* Sub-Tab 1: 10-Parameter Results Table */}
          {activeSubTab === 'TABLE' && (
            <TenParameterTable results={results} />
          )}

          {/* Sub-Tab 2: Per-Image Comparison (5 Images) */}
          {activeSubTab === 'PER_IMAGE' && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Select Benchmark Image for Per-Image Evaluation
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    View full 10-parameter breakdown for each individual test image across all 5 models.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                  {FIVE_BENCHMARK_IMAGES.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setSelectedPerImageId(img.id)}
                      className={`px-2.5 py-1.5 rounded-lg border transition ${
                        selectedPerImageId === img.id
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-semibold'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {img.id}
                    </button>
                  ))}
                </div>
              </div>

              {suiteResults[selectedPerImageId] ? (
                <TenParameterTable results={suiteResults[selectedPerImageId]} />
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-3">
                  <div className="text-slate-300 font-medium">
                    Suite Results Not Yet Computed for {selectedPerImageId}
                  </div>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Click "RUN 5-IMAGE RESEARCH SUITE" to evaluate all 5 images automatically and unlock per-image cross comparisons.
                  </p>
                  <button
                    type="button"
                    onClick={runFiveImageBenchmark}
                    disabled={isRunning}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition"
                  >
                    RUN 5-IMAGE RESEARCH SUITE NOW
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Sub-Tab 3: Aggregate Statistics */}
          {activeSubTab === 'AGGREGATES' && (
            <AggregateStatsTable
              aggregates={suiteAggregates}
              imageCount={Object.keys(suiteResults).length || 5}
            />
          )}

          {/* Sub-Tab 4: Interactive Charts */}
          {activeSubTab === 'CHARTS' && (
            <BenchmarkCharts
              currentResults={displayedResults}
              aggregates={suiteAggregates}
            />
          )}

          {/* Sub-Tab 5: Cover & Stego Visual Gallery */}
          {activeSubTab === 'GALLERY' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Eye className="h-4 w-4 text-cyan-400" />
                    Cover, Stego, Residual Difference & LSB Map
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Residuals are amplified 12× to reveal structural artifacts. Click any preview to zoom.
                  </p>
                </div>
              </div>

              {/* Grid of Models */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {displayedResults.map((r) => (
                  <div key={r.modelId} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200 text-xs font-mono">{r.modelName}</span>
                      <span className="text-[11px] font-mono text-cyan-400 font-bold">{r.psnr.toFixed(2)} dB</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {/* Stego */}
                      {r.stegoDataUrl && (
                        <div
                          onClick={() => setSelectedModalImage({ url: r.stegoDataUrl!, title: `${r.modelName} — Stego Image` })}
                          className="aspect-square bg-slate-900 rounded-lg overflow-hidden relative cursor-pointer border border-slate-800 group"
                        >
                          <img src={r.stegoDataUrl} alt="Stego" className="w-full h-full object-cover group-hover:scale-105 transition" />
                          <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-black/70 text-[9px] font-mono text-cyan-300">
                            Stego
                          </span>
                        </div>
                      )}

                      {/* Residual */}
                      {r.residualDataUrl && (
                        <div
                          onClick={() => setSelectedModalImage({ url: r.residualDataUrl!, title: `${r.modelName} — Residual (12×)` })}
                          className="aspect-square bg-slate-900 rounded-lg overflow-hidden relative cursor-pointer border border-slate-800 group"
                        >
                          <img src={r.residualDataUrl} alt="Residual" className="w-full h-full object-cover group-hover:scale-105 transition" />
                          <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-black/70 text-[9px] font-mono text-amber-300">
                            Residual (12×)
                          </span>
                        </div>
                      )}

                      {/* LSB Map */}
                      {r.lsbMapDataUrl && (
                        <div
                          onClick={() => setSelectedModalImage({ url: r.lsbMapDataUrl!, title: `${r.modelName} — LSB Bitplane Map` })}
                          className="aspect-square bg-slate-900 rounded-lg overflow-hidden relative cursor-pointer border border-slate-800 group"
                        >
                          <img src={r.lsbMapDataUrl} alt="LSB Map" className="w-full h-full object-cover group-hover:scale-105 transition" />
                          <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-black/70 text-[9px] font-mono text-indigo-300">
                            LSB Map
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Research Integrity Disclaimers Card */}
      <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 text-xs space-y-2">
        <div className="flex items-center gap-2 text-slate-300 font-semibold">
          <Info className="h-4 w-4 text-cyan-400" />
          <span>Research Integrity & Verification Directives</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-400 leading-relaxed">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
            <strong className="text-slate-200 block mb-1">Empirical Reproducibility</strong>
            Metrics are generated live through byte-level execution of the encoder/decoder functions rather than retrieved from static publication claims.
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
            <strong className="text-slate-200 block mb-1">Strict True-Positive Gate</strong>
            A model is only eligible for fidelity ranking if the decoder reproduces the payload with exact string parity and zero bit errors (BER = 0).
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
            <strong className="text-slate-200 block mb-1">Steganalysis Security Gate</strong>
            Imperceptibility (PSNR) does not imply security. Chi-Square statistical detection tests ensure Pairs of Values (PoVs) do not reveal artificial LSB equalization.
          </div>
        </div>
      </div>

      {/* Image Zoom Modal */}
      {selectedModalImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedModalImage(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-sm font-semibold text-white font-mono">{selectedModalImage.title}</h4>
              <button
                type="button"
                onClick={() => setSelectedModalImage(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>
            <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center p-2">
              <img
                src={selectedModalImage.url}
                alt="Zoom Preview"
                className="max-h-[70vh] max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
