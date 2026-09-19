import { BenchmarkRunSummary, PerImageBenchmarkCase } from '../types';

export const RESEARCH_RUNS = [
  {
    id: "research_20260919_203322",
    name: "Final Test Benchmark (256×256, 20 Covers)",
    resolution: 256,
    date: "2026-09-19 20:33:22",
    imagesCount: 20,
    status: "Completed",
    bestModel: "ARES-Hybrid-INN",
    bestPSNR: "75.34 dB",
    recoveryRate: "100.0%"
  },
  {
    id: "research_20260919_145906",
    name: "Research Pilot Run (256×256, 20 Covers)",
    resolution: 256,
    date: "2026-09-19 14:59:06",
    imagesCount: 20,
    status: "Completed",
    bestModel: "ARES-Hybrid-INN",
    bestPSNR: "75.33 dB",
    recoveryRate: "100.0%"
  },
  {
    id: "research_20260919_203347",
    name: "Low-Resolution Baseline (128×128, 20 Covers)",
    resolution: 128,
    date: "2026-09-19 20:33:47",
    imagesCount: 20,
    status: "Completed",
    bestModel: "ARES-Hybrid-INN",
    bestPSNR: "75.29 dB",
    recoveryRate: "100.0%"
  }
];

export const LATEST_RUN_SUMMARY: BenchmarkRunSummary = {
  run_id: "research_20260919_203322",
  out_dir: "results/research_20260919_203322",
  category: "FINAL_TEST",
  aggregates: {
    ares_hybrid_inn: {
      model_name: "ARES-Hybrid-INN",
      resolution: 256,
      n: 20,
      n_tp: 20,
      psnr: {
        n: 20,
        mean: 75.34135,
        median: 75.3381,
        std: 0.05647,
        min: 75.2348,
        max: 75.4797,
        ci95_low: 75.3166,
        ci95_high: 75.3661,
        pct_ge_70: 100.0,
        pct_ge_75: 100.0,
        pct_ge_80: 0.0
      },
      ssim: {
        n: 20,
        mean: 0.999999,
        median: 0.999999,
        std: 0.0000001,
        min: 0.999999,
        max: 0.999999,
        ci95_low: 0.999999,
        ci95_high: 0.999999
      },
      mse: {
        n: 20,
        mean: 0.001901,
        median: 0.001902,
        std: 0.000025,
        min: 0.001841,
        max: 0.001948,
        ci95_low: 0.001890,
        ci95_high: 0.001912
      },
      ber: { n: 20, mean: 0.0, median: 0.0, std: 0.0, min: 0.0, max: 0.0, ci95_low: 0.0, ci95_high: 0.0 },
      lsb_change_percent: {
        n: 20,
        mean: 0.1901,
        median: 0.1902,
        std: 0.0025,
        min: 0.1841,
        max: 0.1948,
        ci95_low: 0.1890,
        ci95_high: 0.1912
      },
      total_ms: {
        n: 20,
        mean: 701.75,
        median: 702.28,
        std: 188.49,
        min: 419.92,
        max: 1023.38,
        ci95_low: 619.14,
        ci95_high: 784.36
      },
      exact_recovery_rate: 100.0
    },
    paper_model_01: {
      model_name: "Kanimozhi RNN+Fuzzy (2025)",
      resolution: 256,
      n: 20,
      n_tp: 20,
      psnr: {
        n: 20,
        mean: 74.7283,
        median: 74.7473,
        std: 0.1837,
        min: 74.3182,
        max: 75.0462,
        ci95_low: 74.6478,
        ci95_high: 74.8088,
        pct_ge_70: 100.0,
        pct_ge_75: 10.0,
        pct_ge_80: 0.0
      },
      ssim: {
        n: 20,
        mean: 0.999999,
        median: 0.999999,
        std: 0.0000001,
        min: 0.999999,
        max: 0.999999,
        ci95_low: 0.999999,
        ci95_high: 0.999999
      },
      mse: {
        n: 20,
        mean: 0.002191,
        median: 0.002179,
        std: 0.000093,
        min: 0.002035,
        max: 0.002406,
        ci95_low: 0.002150,
        ci95_high: 0.002232
      },
      ber: { n: 20, mean: 0.0, median: 0.0, std: 0.0, min: 0.0, max: 0.0, ci95_low: 0.0, ci95_high: 0.0 },
      lsb_change_percent: {
        n: 20,
        mean: 0.2191,
        median: 0.2180,
        std: 0.0093,
        min: 0.2035,
        max: 0.2406,
        ci95_low: 0.2150,
        ci95_high: 0.2232
      },
      total_ms: {
        n: 20,
        mean: 60.53,
        median: 61.32,
        std: 9.78,
        min: 48.54,
        max: 78.58,
        ci95_low: 56.24,
        ci95_high: 64.81
      },
      exact_recovery_rate: 100.0
    },
    paper_model_04: {
      model_name: "Aljarf DL-Steg ECC+SAE (2025)",
      resolution: 256,
      n: 20,
      n_tp: 20,
      psnr: {
        n: 20,
        mean: 74.6669,
        median: 74.6472,
        std: 0.1479,
        min: 74.3736,
        max: 74.9496,
        ci95_low: 74.6021,
        ci95_high: 74.7317,
        pct_ge_70: 100.0,
        pct_ge_75: 0.0,
        pct_ge_80: 0.0
      },
      ssim: {
        n: 20,
        mean: 0.999999,
        median: 0.999999,
        std: 0.0000001,
        min: 0.999999,
        max: 0.999999,
        ci95_low: 0.999999,
        ci95_high: 0.999999
      },
      mse: {
        n: 20,
        mean: 0.002221,
        median: 0.002230,
        std: 0.000075,
        min: 0.002080,
        max: 0.002375,
        ci95_low: 0.002188,
        ci95_high: 0.002255
      },
      ber: { n: 20, mean: 0.0, median: 0.0, std: 0.0, min: 0.0, max: 0.0, ci95_low: 0.0, ci95_high: 0.0 },
      lsb_change_percent: {
        n: 20,
        mean: 0.2222,
        median: 0.2231,
        std: 0.0075,
        min: 0.2080,
        max: 0.2375,
        ci95_low: 0.2188,
        ci95_high: 0.2255
      },
      total_ms: {
        n: 20,
        mean: 60.83,
        median: 62.68,
        std: 8.37,
        min: 48.84,
        max: 71.93,
        ci95_low: 57.16,
        ci95_high: 64.50
      },
      exact_recovery_rate: 100.0
    },
    paper_model_03: {
      model_name: "Rahman LSB+MagicMatrix (2025)",
      resolution: 256,
      n: 20,
      n_tp: 20,
      psnr: {
        n: 20,
        mean: 74.5536,
        median: 74.5347,
        std: 0.1492,
        min: 74.3090,
        max: 74.8447,
        ci95_low: 74.4882,
        ci95_high: 74.6190,
        pct_ge_70: 100.0,
        pct_ge_75: 0.0,
        pct_ge_80: 0.0
      },
      ssim: {
        n: 20,
        mean: 0.999999,
        median: 0.999999,
        std: 0.0000001,
        min: 0.999999,
        max: 0.999999,
        ci95_low: 0.999999,
        ci95_high: 0.999999
      },
      mse: {
        n: 20,
        mean: 0.002280,
        median: 0.002289,
        std: 0.000078,
        min: 0.002131,
        max: 0.002411,
        ci95_low: 0.002246,
        ci95_high: 0.002314
      },
      ber: { n: 20, mean: 0.0, median: 0.0, std: 0.0, min: 0.0, max: 0.0, ci95_low: 0.0, ci95_high: 0.0 },
      lsb_change_percent: {
        n: 20,
        mean: 0.2280,
        median: 0.2289,
        std: 0.0078,
        min: 0.2131,
        max: 0.2411,
        ci95_low: 0.2246,
        ci95_high: 0.2314
      },
      total_ms: {
        n: 20,
        mean: 59.29,
        median: 59.42,
        std: 9.67,
        min: 48.70,
        max: 69.87,
        ci95_low: 55.05,
        ci95_high: 63.53
      },
      exact_recovery_rate: 100.0
    },
    paper_model_02: {
      model_name: "Sanjalawe Huffman+LSB+DL (2025)",
      resolution: 256,
      n: 20,
      n_tp: 20,
      psnr: {
        n: 20,
        mean: 73.2118,
        median: 73.2099,
        std: 0.1310,
        min: 73.0050,
        max: 73.4626,
        ci95_low: 73.1544,
        ci95_high: 73.2692,
        pct_ge_70: 100.0,
        pct_ge_75: 0.0,
        pct_ge_80: 0.0
      },
      ssim: {
        n: 20,
        mean: 0.999999,
        median: 0.999999,
        std: 0.0000005,
        min: 0.999998,
        max: 0.999999,
        ci95_low: 0.999998,
        ci95_high: 0.999999
      },
      mse: {
        n: 20,
        mean: 0.003105,
        median: 0.003105,
        std: 0.000093,
        min: 0.002930,
        max: 0.003255,
        ci95_low: 0.003064,
        ci95_high: 0.003146
      },
      ber: { n: 20, mean: 0.0, median: 0.0, std: 0.0, min: 0.0, max: 0.0, ci95_low: 0.0, ci95_high: 0.0 },
      lsb_change_percent: {
        n: 20,
        mean: 0.3105,
        median: 0.3106,
        std: 0.0093,
        min: 0.2930,
        max: 0.3255,
        ci95_low: 0.3064,
        ci95_high: 0.3146
      },
      total_ms: {
        n: 20,
        mean: 60.16,
        median: 61.70,
        std: 9.00,
        min: 48.80,
        max: 71.16,
        ci95_low: 56.21,
        ci95_high: 64.10
      },
      exact_recovery_rate: 100.0
    }
  },
  psnr_generalization: [
    {
      dataset: "mixed_test",
      resolution: 256,
      model: "ares_hybrid_inn",
      model_name: "ARES-Hybrid-INN",
      mean_psnr: 75.34135,
      median_psnr: 75.3381,
      std_psnr: 0.05647,
      min_psnr: 75.2348,
      max_psnr: 75.4797,
      ci95_low: 75.3166,
      ci95_high: 75.3661,
      pct_ge_70: 100.0,
      pct_ge_75: 100.0,
      pct_ge_80: 0.0,
      n_tp: 20,
      exact_recovery_rate: 100.0
    },
    {
      dataset: "mixed_test",
      resolution: 256,
      model: "paper_model_01",
      model_name: "Kanimozhi RNN+Fuzzy (2025)",
      mean_psnr: 74.7283,
      median_psnr: 74.7473,
      std_psnr: 0.1837,
      min_psnr: 74.3182,
      max_psnr: 75.0462,
      ci95_low: 74.6478,
      ci95_high: 74.8088,
      pct_ge_70: 100.0,
      pct_ge_75: 10.0,
      pct_ge_80: 0.0,
      n_tp: 20,
      exact_recovery_rate: 100.0
    },
    {
      dataset: "mixed_test",
      resolution: 256,
      model: "paper_model_04",
      model_name: "Aljarf DL-Steg ECC+SAE (2025)",
      mean_psnr: 74.6669,
      median_psnr: 74.6472,
      std_psnr: 0.1479,
      min_psnr: 74.3736,
      max_psnr: 74.9496,
      ci95_low: 74.6021,
      ci95_high: 74.7317,
      pct_ge_70: 100.0,
      pct_ge_75: 0.0,
      pct_ge_80: 0.0,
      n_tp: 20,
      exact_recovery_rate: 100.0
    },
    {
      dataset: "mixed_test",
      resolution: 256,
      model: "paper_model_03",
      model_name: "Rahman LSB+MagicMatrix (2025)",
      mean_psnr: 74.5536,
      median_psnr: 74.5347,
      std_psnr: 0.1492,
      min_psnr: 74.3090,
      max_psnr: 74.8447,
      ci95_low: 74.4882,
      ci95_high: 74.6190,
      pct_ge_70: 100.0,
      pct_ge_75: 0.0,
      pct_ge_80: 0.0,
      n_tp: 20,
      exact_recovery_rate: 100.0
    },
    {
      dataset: "mixed_test",
      resolution: 256,
      model: "paper_model_02",
      model_name: "Sanjalawe Huffman+LSB+DL (2025)",
      mean_psnr: 73.2118,
      median_psnr: 73.2099,
      std_psnr: 0.1310,
      min_psnr: 73.0050,
      max_psnr: 73.4626,
      ci95_low: 73.1544,
      ci95_high: 73.2692,
      pct_ge_70: 100.0,
      pct_ge_75: 0.0,
      pct_ge_80: 0.0,
      n_tp: 20,
      exact_recovery_rate: 100.0
    }
  ],
  n_invalid: 0,
  best_true_positive: {
    model: "ares_hybrid_inn",
    model_name: "ARES-Hybrid-INN",
    psnr: 75.4797,
    image_id: "syn_0069",
    note: "Best single-image true-positive observation (exact secret recovery + 75.48 dB PSNR)"
  }
};

// Generates paths for the 20 benchmark test images
export const BENCHMARK_IMAGE_IDS = Array.from({ length: 20 }, (_, i) => {
  const num = (50 + i).toString().padStart(4, '0');
  return `syn_${num}`;
});

export const BENCHMARK_IMAGE_PREVIEWS: Record<string, string> = {};
BENCHMARK_IMAGE_IDS.forEach(id => {
  BENCHMARK_IMAGE_PREVIEWS[id] = `/results/research_20260919_203322/per_image/${id}/cover.png`;
});
