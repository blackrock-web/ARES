import { BenchmarkRowResult, ModelTenParameterAggregates } from '../types';

export interface ExportEvaluationRecord {
  imageId: string;
  imageResolution: number;
  modelId: string;
  modelName: string;
  // Parameter 1
  psnr_db: number;
  // Parameter 2
  ssim: number;
  // Parameter 3
  mse: number;
  // Parameter 4
  payload_size_bytes: number;
  capacity_bytes: number;
  payload_utilization_pct: number;
  bpp: number;
  // Parameter 5
  exact_recovery: boolean;
  recovery_status: string;
  ber: number;
  // Parameter 6
  embedding_time_ms: number;
  // Parameter 7
  decoding_time_ms: number;
  // Parameter 8
  device_context: string;
  gpu_context: string;
  cpu_threads: string;
  memory_footprint: string;
  // Parameter 9
  robustness_rate_pct: number | string;
  // Parameter 10
  steganalysis_cover_detect_prob: number | string;
  steganalysis_stego_detect_prob: number | string;
  steganalysis_p_value: number | string;
  steganalysis_verdict: string;
}

/**
 * Format records into CSV format with full 10-parameter headers
 */
export function exportToCSV(records: ExportEvaluationRecord[], filename = 'ares_10_parameter_benchmark.csv') {
  const headers = [
    'Image_ID',
    'Resolution',
    'Model_ID',
    'Model_Name',
    'Param1_PSNR_dB (↑ Higher=Better)',
    'Param2_SSIM (↑ Higher=Better)',
    'Param3_MSE (↓ Lower=Better)',
    'Param4_Payload_Bytes',
    'Param4_Capacity_Bytes',
    'Param4_Payload_Utilization_Pct (↑ Higher=Better)',
    'Param4_BPP',
    'Param5_Exact_Recovery',
    'Param5_Recovery_Status',
    'Param5_BER (↓ Lower=Better)',
    'Param6_Embedding_Time_ms (↓ Lower=Better)',
    'Param7_Decoding_Time_ms (↓ Lower=Better)',
    'Param8_Device_Context',
    'Param8_GPU_Context',
    'Param8_CPU_Threads',
    'Param8_Memory_Footprint',
    'Param9_Robustness_Rate_Pct (↑ Higher=Better)',
    'Param10_Cover_Detect_Prob',
    'Param10_Stego_Detect_Prob (↓ Lower=Better)',
    'Param10_P_Value',
    'Param10_Steganalysis_Verdict'
  ];

  const rows = records.map(r => [
    `"${r.imageId}"`,
    r.imageResolution,
    `"${r.modelId}"`,
    `"${r.modelName}"`,
    r.psnr_db,
    r.ssim,
    r.mse,
    r.payload_size_bytes,
    r.capacity_bytes,
    r.payload_utilization_pct,
    r.bpp,
    r.exact_recovery ? 'TRUE' : 'FALSE',
    `"${r.recovery_status}"`,
    r.ber,
    r.embedding_time_ms,
    r.decoding_time_ms,
    `"${r.device_context}"`,
    `"${r.gpu_context}"`,
    `"${r.cpu_threads}"`,
    `"${r.memory_footprint}"`,
    r.robustness_rate_pct,
    r.steganalysis_cover_detect_prob,
    r.steganalysis_stego_detect_prob,
    r.steganalysis_p_value,
    `"${r.steganalysis_verdict}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
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

/**
 * Format records and aggregates into structured JSON
 */
export function exportToJSON(
  records: ExportEvaluationRecord[],
  aggregates: Record<string, ModelTenParameterAggregates>,
  metadata = { benchmarkSuite: '10-Parameter Model Benchmark', dataset: '5 Benchmark Images' },
  filename = 'ares_10_parameter_benchmark.json'
) {
  const exportPayload = {
    metadata: {
      ...metadata,
      exportedAt: new Date().toISOString(),
      parametersDefined: [
        { id: 1, name: 'PSNR (dB)', direction: 'Higher is better' },
        { id: 2, name: 'SSIM', direction: 'Higher is better' },
        { id: 3, name: 'MSE', direction: 'Lower is better' },
        { id: 4, name: 'Payload Capacity & Utilization', direction: 'Higher is better' },
        { id: 5, name: 'Payload Recovery Accuracy / BER', direction: 'Lower is better for BER' },
        { id: 6, name: 'Embedding Time (ms)', direction: 'Lower is better' },
        { id: 7, name: 'Decoding Time (ms)', direction: 'Lower is better' },
        { id: 8, name: 'Computational Resource Usage', direction: 'Lower is better footprint' },
        { id: 9, name: 'Robustness Under Attack', direction: 'Higher is better' },
        { id: 10, name: 'Steganalysis Detectability', direction: 'Lower is better' }
      ]
    },
    aggregates,
    evaluations: records
  };

  const jsonString = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
