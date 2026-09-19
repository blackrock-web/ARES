export interface PaperMetadata {
  id: string;
  model_slot: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  doi: string;
  architecture: string;
  embedding: string;
  payload: string;
  reported_metrics: Record<string, string | number>;
  official_weights: boolean;
  our_status: string;
  limitations: string;
}

export interface ModelRegistryItem {
  id: string;
  name: string;
  type: 'proposed' | 'paper';
  module?: string;
  class?: string;
  weights?: string | null;
  status: 'PROPOSED' | 'TRAINED' | 'REPRODUCED';
  paper_id?: string | null;
  supports_gpu?: boolean;
  default_bpp?: number;
  ecc_modes?: string[];
  architecture?: string;
  paper?: PaperMetadata;
}

export interface MetricAggregate {
  n: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  ci95_low: number;
  ci95_high: number;
  pct_ge_70?: number;
  pct_ge_75?: number;
  pct_ge_80?: number;
}

export interface ModelAggregateStat {
  model_name: string;
  resolution: number;
  n: number;
  n_tp: number;
  psnr: MetricAggregate;
  ssim: MetricAggregate;
  mse: MetricAggregate;
  ber: MetricAggregate;
  lsb_change_percent: MetricAggregate;
  total_ms: MetricAggregate;
  exact_recovery_rate: number;
}

export interface PSNRGeneralization {
  dataset: string;
  resolution: number;
  model: string;
  model_name: string;
  mean_psnr: number;
  median_psnr: number;
  std_psnr: number;
  min_psnr: number;
  max_psnr: number;
  ci95_low: number;
  ci95_high: number;
  pct_ge_70: number;
  pct_ge_75: number;
  pct_ge_80: number;
  n_tp: number;
  exact_recovery_rate: number;
}

export interface BenchmarkRunSummary {
  run_id: string;
  out_dir: string;
  category: string;
  aggregates: Record<string, ModelAggregateStat>;
  psnr_generalization: PSNRGeneralization[];
  n_invalid: number;
  best_true_positive: {
    model: string;
    model_name: string;
    psnr: number;
    image_id: string;
    note: string;
  };
}

export interface ResourceUsageInfo {
  device: string;
  gpuModel?: string;
  gpuMemory?: string;
  cpuUsage?: string;
  ramUsage?: string;
  environmentNote?: string;
}

export interface AttackEvaluationResult {
  attackName: string;
  description: string;
  recovered: boolean;
  status: 'PASS' | 'FAIL';
  ber: number; // Bit Error Rate under this attack
  recoveredTextPreview?: string;
}

export interface SteganalysisResult {
  status: 'AVAILABLE' | 'NOT_AVAILABLE';
  methodName: string;
  coverDetectProb: number; // 0.0 - 1.0 (false positive probability)
  stegoDetectProb: number; // 0.0 - 1.0 (detection probability)
  pValue: number;
  detectionVerdict: 'UNDETECTED' | 'SUSPECT' | 'DETECTED';
  note: string;
}

export interface TenParameterMetrics {
  // 1. PSNR (dB) - Higher = better
  psnr: number;
  // 2. SSIM - Higher = better
  ssim: number;
  // 3. MSE - Lower = better
  mse: number;
  // 4. Payload Capacity & Utilization - Higher = better
  payloadSizeBytes: number;
  capacityBytes: number;
  payloadUtilizationPct: number;
  bpp: number;
  // 5. Payload Recovery Accuracy - Higher = better (recovery), Lower = better (BER)
  exactRecovery: boolean;
  recoveryStatus: 'PASS' | 'FAIL' | 'NOT VERIFIED';
  ber: number; // Bit Error Rate (0.0 to 1.0)
  recoveredText?: string;
  // 6. Embedding Time (ms) - Lower = better
  embeddingTimeMs: number;
  // 7. Decoding Time (ms) - Lower = better
  decodingTimeMs: number;
  // 8. Computational Resource Usage
  resourceUsage: ResourceUsageInfo;
  // 9. Robustness Under Attack - Higher = better
  robustnessEvaluated: boolean;
  robustnessRate: number | null; // e.g. 85.7% (passed / total valid attacks) or null if not evaluated
  attackBreakdown?: AttackEvaluationResult[];
  // 10. Steganalysis Detectability - Lower = better
  steganalysis: SteganalysisResult;
}

export interface BenchmarkRowResult extends TenParameterMetrics {
  modelId: string;
  modelName: string;
  status: string;
  ms_ssim: number;
  truePositive: boolean;
  timeMs: number;
  lsbChangePct: number;
  stegoDataUrl?: string;
  residualDataUrl?: string;
  lsbMapDataUrl?: string;
  error?: string;
}

export interface AggregateStatsForMetric {
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
}

export interface ModelTenParameterAggregates {
  modelId: string;
  modelName: string;
  imageCount: number;
  exactRecoveryRate: number; // % (e.g. 100%)
  psnr: AggregateStatsForMetric;
  ssim: AggregateStatsForMetric;
  mse: AggregateStatsForMetric;
  payloadUtilizationPct: AggregateStatsForMetric;
  ber: AggregateStatsForMetric;
  embeddingTimeMs: AggregateStatsForMetric;
  decodingTimeMs: AggregateStatsForMetric;
  robustnessRate: AggregateStatsForMetric | null;
  stegoDetectProb: AggregateStatsForMetric | null;
}

export interface PerImagePerModelData {
  stego: string;
  residual: string;
  lsb_map: string;
  metrics: {
    model_id: string;
    model_name: string;
    exact_recovery: boolean;
    psnr: number;
    ssim: number;
    mse: number;
    ms_ssim: number;
    ber: number;
    lsb_change_percent: number;
    pixel_change_percent: number;
    total_ms: number;
    encode_ms: number;
    decode_ms: number;
    payload_bits: number;
    payload_size_bytes?: number;
    capacity_bytes?: number;
    payload_utilization_percent?: number;
    robustness_rate?: number | null;
    stego_detect_prob?: number;
    cover_detect_prob?: number;
    resource_device?: string;
  };
}

export interface PerImageBenchmarkCase {
  id: string;
  cover: string;
  models: Record<string, PerImagePerModelData>;
}

export type ExecutionStatus = 'SUCCESS' | 'FAILED' | 'UNAVAILABLE' | 'NOT_EXECUTED';

export interface BenchmarkImageItem {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  isCustom?: boolean;
}

export interface BenchmarkEvaluationResult {
  imageId: string;
  imageName: string;
  modelId: string;
  modelName: string;
  status: ExecutionStatus;
  reason?: string;
  error?: string;
  metrics: {
    psnr: number | null;
    ssim: number | null;
    mse: number | null;
    bpp: number | null;
    capacityBytes: number | null;
    payloadSizeBytes: number | null;
    payloadUtilizationPct: number | null;
  };
  payload: {
    sizeBytes: number;
    type: 'text' | 'binary';
    preview?: string;
  };
  encoding: {
    timeMs: number | null;
    timeSeconds: number | null;
  };
  decoding: {
    timeMs: number | null;
    timeSeconds: number | null;
  };
  recovery: {
    status: 'PASS' | 'FAIL' | 'NOT VERIFIED';
    exactMatch: boolean;
    ber: number | null;
    recoveredSize: number | null;
    recoveredTextPreview?: string;
  };
  stegoDataUrl?: string;
  residualDataUrl?: string;
  lsbMapDataUrl?: string;
  steganalysis?: SteganalysisResult;
  deviceContext?: ResourceUsageInfo;
}

export interface BenchmarkRun {
  runId: string;
  timestamp: string;
  source: 'LIVE_EVALUATION' | 'PRECOMPUTED_REFERENCE';
  images: BenchmarkImageItem[];
  modelIds: string[];
  results: BenchmarkEvaluationResult[];
  config: {
    payloadType: 'text' | 'binary';
    payloadSizeBytes: number;
    evaluateSecurity: boolean;
    passphraseProvided: boolean; // Plaintext passphrase is NEVER stored
    deviceContext: ResourceUsageInfo;
  };
  summary: {
    totalRequested: number;
    successful: number;
    failed: number;
    unavailable: number;
    notExecuted: number;
  };
}

export interface AdapterEmbedResult {
  status: ExecutionStatus;
  stegoImgData?: ImageData;
  stegoDataUrl?: string;
  residualDataUrl?: string;
  lsbMapDataUrl?: string;
  payloadBits: number;
  payloadSizeBytes: number;
  capacityBytes: number;
  payloadUtilizationPct: number;
  bpp: number;
  encodeTimeMs: number;
  error?: string;
  reason?: string;
}

export interface AdapterDecodeResult {
  status: ExecutionStatus;
  recoveredText: string;
  recoveredBytes?: Uint8Array;
  decodeTimeMs: number;
  exactMatch: boolean;
  recoveryStatus: 'PASS' | 'FAIL' | 'NOT VERIFIED';
  ber: number;
  error?: string;
  reason?: string;
}

export interface IModelAdapter {
  id: string;
  name: string;
  slot: string;
  type: 'proposed' | 'paper';
  supportsGPU: boolean;
  isAvailable: boolean;
  validateCompatibility: (
    width: number,
    height: number,
    payloadSizeBytes: number
  ) => { compatible: boolean; reason?: string };
  embed: (
    coverImgData: ImageData,
    secretPayload: string,
    passphrase?: string
  ) => Promise<AdapterEmbedResult>;
  decode: (
    stegoImgData: ImageData,
    passphrase?: string,
    referencePayload?: string
  ) => Promise<AdapterDecodeResult>;
}
