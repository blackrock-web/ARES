import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { BenchmarkRowResult, ModelTenParameterAggregates } from '../types';

interface BenchmarkChartsProps {
  currentResults: BenchmarkRowResult[];
  aggregates?: Record<string, ModelTenParameterAggregates>;
}

type MetricKey =
  | 'psnr'
  | 'ssim'
  | 'mse'
  | 'payloadUtilizationPct'
  | 'ber'
  | 'embeddingTimeMs'
  | 'decodingTimeMs'
  | 'robustnessRate'
  | 'stegoDetectProb';

interface MetricOption {
  key: MetricKey;
  label: string;
  unit: string;
  direction: '↑ Higher = better' | '↓ Lower = better';
  color: string;
}

const METRIC_OPTIONS: MetricOption[] = [
  { key: 'psnr', label: '1. PSNR', unit: 'dB', direction: '↑ Higher = better', color: '#06b6d4' },
  { key: 'ssim', label: '2. SSIM', unit: '', direction: '↑ Higher = better', color: '#3b82f6' },
  { key: 'mse', label: '3. MSE', unit: '', direction: '↓ Lower = better', color: '#f59e0b' },
  { key: 'payloadUtilizationPct', label: '4. Capacity Utilization', unit: '%', direction: '↑ Higher = better', color: '#10b981' },
  { key: 'ber', label: '5. Bit Error Rate (BER)', unit: '', direction: '↓ Lower = better', color: '#ef4444' },
  { key: 'embeddingTimeMs', label: '6. Embedding Time', unit: 'ms', direction: '↓ Lower = better', color: '#8b5cf6' },
  { key: 'decodingTimeMs', label: '7. Decoding Time', unit: 'ms', direction: '↓ Lower = better', color: '#ec4899' },
  { key: 'robustnessRate', label: '9. Robustness Under Attack', unit: '%', direction: '↑ Higher = better', color: '#14b8a6' },
  { key: 'stegoDetectProb', label: '10. Steganalysis Detectability', unit: '%', direction: '↓ Lower = better', color: '#f97316' },
];

export const BenchmarkCharts: React.FC<BenchmarkChartsProps> = ({ currentResults, aggregates }) => {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('psnr');
  const [chartMode, setChartMode] = useState<'BAR' | 'RADAR'>('BAR');

  const activeOption = METRIC_OPTIONS.find((m) => m.key === selectedMetric) || METRIC_OPTIONS[0];

  // Prepare Bar chart data
  const barData = currentResults.map((r) => {
    let value = 0;
    if (selectedMetric === 'psnr') value = r.psnr;
    else if (selectedMetric === 'ssim') value = r.ssim;
    else if (selectedMetric === 'mse') value = r.mse;
    else if (selectedMetric === 'payloadUtilizationPct') value = r.payloadUtilizationPct;
    else if (selectedMetric === 'ber') value = r.ber;
    else if (selectedMetric === 'embeddingTimeMs') value = r.embeddingTimeMs;
    else if (selectedMetric === 'decodingTimeMs') value = r.decodingTimeMs;
    else if (selectedMetric === 'robustnessRate') value = r.robustnessRate ?? 0;
    else if (selectedMetric === 'stegoDetectProb') value = Math.round(r.steganalysis.stegoDetectProb * 100);

    return {
      modelName: r.modelName.replace(/\s*\(.*?\)/, ''), // clean short name
      fullName: r.modelName,
      value: Number(value.toFixed(selectedMetric === 'ssim' ? 6 : 3)),
      isBest: r.modelId === 'ares_hybrid_inn'
    };
  });

  // Prepare Radar chart data for normalized multi-objective evaluation
  const radarData = [
    { subject: 'Imperceptibility (PSNR)', fullMark: 100 },
    { subject: 'Structural Fidelity (SSIM)', fullMark: 100 },
    { subject: 'Payload Utilization', fullMark: 100 },
    { subject: 'Recovery Reliability', fullMark: 100 },
    { subject: 'Execution Speed', fullMark: 100 },
    { subject: 'Attack Robustness', fullMark: 100 },
    { subject: 'Steganalysis Resistance', fullMark: 100 }
  ].map(axis => {
    const item: Record<string, any> = { subject: axis.subject };
    currentResults.forEach(r => {
      let score = 50;
      if (axis.subject.includes('PSNR')) {
        // 70 dB -> 50, 75.5 dB -> 100
        score = Math.min(100, Math.max(0, ((r.psnr - 70) / 6) * 100));
      } else if (axis.subject.includes('SSIM')) {
        score = Math.min(100, Math.max(0, (r.ssim - 0.9999) * 1000000));
      } else if (axis.subject.includes('Payload')) {
        score = Math.min(100, r.payloadUtilizationPct * 10);
      } else if (axis.subject.includes('Recovery')) {
        score = r.exactRecovery ? (1 - r.ber) * 100 : 0;
      } else if (axis.subject.includes('Speed')) {
        score = Math.min(100, Math.max(10, 100 - (r.embeddingTimeMs / 10)));
      } else if (axis.subject.includes('Robustness')) {
        score = r.robustnessRate ?? 0;
      } else if (axis.subject.includes('Steganalysis')) {
        score = (1 - r.steganalysis.stegoDetectProb) * 100;
      }
      item[r.modelId] = Math.round(score);
    });
    return item;
  });

  const modelColors: Record<string, string> = {
    ares_hybrid_inn: '#06b6d4', // cyan
    paper_model_01: '#3b82f6',  // blue
    paper_model_02: '#10b981',  // emerald
    paper_model_03: '#f59e0b',  // amber
    paper_model_04: '#8b5cf6'   // purple
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      {/* Header with Metric selector and View toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <span>Research Metrics Visualization</span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              {activeOption.direction}
            </span>
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Compare model performance interactively across all research parameters.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => setChartMode('BAR')}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                chartMode === 'BAR' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Metric Bar Chart
            </button>
            <button
              type="button"
              onClick={() => setChartMode('RADAR')}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                chartMode === 'RADAR' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Multi-Axis Radar
            </button>
          </div>
        </div>
      </div>

      {/* Metric Selector Buttons (for Bar chart) */}
      {chartMode === 'BAR' && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-800/80">
          {METRIC_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSelectedMetric(opt.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono transition border ${
                selectedMetric === opt.key
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-semibold shadow-sm'
                  : 'bg-slate-950/70 text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Chart Canvas */}
      <div className="w-full h-72 pt-2">
        {chartMode === 'BAR' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 15, right: 20, left: 10, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="modelName"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                angle={-10}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                domain={
                  selectedMetric === 'ssim'
                    ? ['dataMin - 0.000002', 'dataMax + 0.000001']
                    : selectedMetric === 'psnr'
                    ? ['dataMin - 1', 'dataMax + 1']
                    : ['auto', 'auto']
                }
                unit={activeOption.unit ? ` ${activeOption.unit}` : ''}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-950 border border-slate-700 rounded-lg p-3 shadow-xl text-xs font-mono">
                        <div className="font-semibold text-white mb-1 font-sans">{data.fullName}</div>
                        <div className="text-cyan-300">
                          {activeOption.label}: <span className="font-bold">{data.value} {activeOption.unit}</span>
                        </div>
                        <div className="text-slate-400 text-[10px] mt-1">{activeOption.direction}</div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey="value"
                fill={activeOption.color}
                radius={[6, 6, 0, 0]}
                name={activeOption.label}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <PolarRadiusAxis stroke="#475569" angle={30} domain={[0, 100]} />
              {currentResults.map((r) => (
                <Radar
                  key={r.modelId}
                  name={r.modelName}
                  dataKey={r.modelId}
                  stroke={modelColors[r.modelId] || '#94a3b8'}
                  fill={modelColors[r.modelId] || '#94a3b8'}
                  fillOpacity={r.modelId === 'ares_hybrid_inn' ? 0.35 : 0.1}
                />
              ))}
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
                formatter={(val) => <span className="text-slate-300 font-sans">{val}</span>}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-950 border border-slate-700 rounded-lg p-2.5 shadow-xl text-xs font-mono">
                        <div className="font-bold text-white mb-1">{label}</div>
                        {payload.map((entry: any) => (
                          <div key={entry.name} style={{ color: entry.color }}>
                            {entry.name}: {entry.value}/100
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
