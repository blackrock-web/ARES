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

export interface BenchmarkRowResult {
  modelId: string;
  modelName: string;
  status: string;
  psnr: number;
  ssim: number;
  mse: number;
  ms_ssim: number;
  bpp: number;
  truePositive: boolean;
  timeMs: number;
  lsbChangePct: number;
  stegoDataUrl?: string;
  residualDataUrl?: string;
  recoveredText?: string;
  error?: string;
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
  };
}

export interface PerImageBenchmarkCase {
  id: string;
  cover: string;
  models: Record<string, PerImagePerModelData>;
}
