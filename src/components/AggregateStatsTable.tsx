import React from 'react';
import { BarChart2, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';
import { ModelTenParameterAggregates } from '../types';

interface AggregateStatsTableProps {
  aggregates: Record<string, ModelTenParameterAggregates>;
  imageCount: number;
}

export const AggregateStatsTable: React.FC<AggregateStatsTableProps> = ({ aggregates, imageCount }) => {
  const modelList = Object.values(aggregates);

  if (modelList.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        Run the 5-Image Suite Benchmark to generate aggregate statistics across all covers.
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-cyan-400" />
            <span>Aggregate Statistics Across Benchmark Images (N = {imageCount} Images)</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Strict statistical aggregates (Mean, Median, Std, Min, Max) calculated from actual evaluations across all test images.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-400">
          Evaluated Covers: syn_0050 – syn_0054
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono">
            <tr>
              <th className="py-2.5 px-3">Model</th>
              <th className="py-2.5 px-3 text-center">True + Rate</th>
              <th className="py-2.5 px-3 text-right">PSNR (Mean ± Std)</th>
              <th className="py-2.5 px-3 text-right">PSNR [Min / Max]</th>
              <th className="py-2.5 px-3 text-right">SSIM (Mean)</th>
              <th className="py-2.5 px-3 text-right">MSE (Mean)</th>
              <th className="py-2.5 px-3 text-right">Util % (Mean)</th>
              <th className="py-2.5 px-3 text-right">BER (Mean)</th>
              <th className="py-2.5 px-3 text-right">Embed ms (Mean)</th>
              <th className="py-2.5 px-3 text-right">Decode ms (Mean)</th>
              <th className="py-2.5 px-3 text-right">Robust % (Mean)</th>
              <th className="py-2.5 px-3 text-right">Detect % (Mean)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 font-mono">
            {modelList.map((m) => {
              const isProposed = m.modelId === 'ares_hybrid_inn';
              return (
                <tr
                  key={m.modelId}
                  className={`hover:bg-slate-800/40 transition ${
                    isProposed ? 'bg-cyan-950/25' : ''
                  }`}
                >
                  <td className="py-3 px-3 font-sans font-medium text-slate-200">
                    <div className="flex items-center gap-1.5">
                      {isProposed && <span className="h-2 w-2 rounded-full bg-cyan-400"></span>}
                      <span className="font-semibold text-slate-100">{m.modelName}</span>
                    </div>
                  </td>

                  {/* True Positive Rate */}
                  <td className="py-3 px-3 text-center font-sans">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                      {m.exactRecoveryRate.toFixed(0)}% ({m.imageCount}/{m.imageCount})
                    </span>
                  </td>

                  {/* PSNR Mean ± Std */}
                  <td className="py-3 px-3 text-right font-bold text-cyan-300">
                    {m.psnr.mean.toFixed(2)}{' '}
                    <span className="text-[11px] font-normal text-slate-400">
                      ±{m.psnr.std.toFixed(3)}
                    </span>
                  </td>

                  {/* PSNR Min / Max */}
                  <td className="py-3 px-3 text-right text-slate-400">
                    [{m.psnr.min.toFixed(1)}, {m.psnr.max.toFixed(1)}]
                  </td>

                  {/* SSIM Mean */}
                  <td className="py-3 px-3 text-right text-slate-200">
                    {m.ssim.mean.toFixed(6)}
                  </td>

                  {/* MSE Mean */}
                  <td className="py-3 px-3 text-right text-slate-400">
                    {m.mse.mean.toExponential(2)}
                  </td>

                  {/* Utilization Mean */}
                  <td className="py-3 px-3 text-right text-slate-300">
                    {m.payloadUtilizationPct.mean.toFixed(2)}%
                  </td>

                  {/* BER Mean */}
                  <td className="py-3 px-3 text-right text-slate-300">
                    {m.ber.mean.toFixed(4)}
                  </td>

                  {/* Embed ms Mean */}
                  <td className="py-3 px-3 text-right text-slate-400">
                    {m.embeddingTimeMs.mean.toFixed(1)}
                  </td>

                  {/* Decode ms Mean */}
                  <td className="py-3 px-3 text-right text-slate-400">
                    {m.decodingTimeMs.mean.toFixed(1)}
                  </td>

                  {/* Robustness Rate Mean */}
                  <td className="py-3 px-3 text-right font-semibold text-teal-300">
                    {m.robustnessRate ? `${m.robustnessRate.mean.toFixed(1)}%` : 'N/A'}
                  </td>

                  {/* Steganalysis Detectability Mean */}
                  <td className="py-3 px-3 text-right text-amber-400">
                    {m.stegoDetectProb ? `${(m.stegoDetectProb.mean * 100).toFixed(1)}%` : 'N/A'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
