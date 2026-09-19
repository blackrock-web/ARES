import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Cpu,
  Zap,
  Info,
  ExternalLink
} from 'lucide-react';
import { BenchmarkRowResult } from '../types';

interface TenParameterTableProps {
  results: BenchmarkRowResult[];
}

export const TenParameterTable: React.FC<TenParameterTableProps> = ({ results }) => {
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);

  const toggleExpand = (modelId: string) => {
    setExpandedModelId(expandedModelId === modelId ? null : modelId);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      {/* Table Header & Info Bar */}
      <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <span>10 Research-Relevant Parameters Matrix</span>
            <span className="text-xs font-normal text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded-full font-mono">
              10 Parameters Verified
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Every metric is calculated directly from actual execution results on identical cover and secret payload.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1 text-emerald-400 font-mono">
            <CheckCircle2 className="h-3.5 w-3.5" />
            PASS = Bit-exact secret recovery
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono">
            <tr>
              <th className="py-3 px-3">Model</th>
              <th className="py-3 px-3 text-right">
                <div>1. PSNR (dB)</div>
                <div className="text-[10px] text-cyan-400 font-sans font-normal">↑ Higher</div>
              </th>
              <th className="py-3 px-3 text-right">
                <div>2. SSIM</div>
                <div className="text-[10px] text-cyan-400 font-sans font-normal">↑ Higher</div>
              </th>
              <th className="py-3 px-3 text-right">
                <div>3. MSE</div>
                <div className="text-[10px] text-amber-400 font-sans font-normal">↓ Lower</div>
              </th>
              <th className="py-3 px-3 text-right">
                <div>4. Capacity & Util</div>
                <div className="text-[10px] text-cyan-400 font-sans font-normal">↑ Higher</div>
              </th>
              <th className="py-3 px-3 text-center">
                <div>5. Recovery & BER</div>
                <div className="text-[10px] text-emerald-400 font-sans font-normal">0.0 BER = Pass</div>
              </th>
              <th className="py-3 px-3 text-right">
                <div>6. Embed Time</div>
                <div className="text-[10px] text-amber-400 font-sans font-normal">↓ Lower</div>
              </th>
              <th className="py-3 px-3 text-right">
                <div>7. Decode Time</div>
                <div className="text-[10px] text-amber-400 font-sans font-normal">↓ Lower</div>
              </th>
              <th className="py-3 px-3 text-center">
                <div>8. Resources</div>
                <div className="text-[10px] text-slate-500 font-sans font-normal">Footprint</div>
              </th>
              <th className="py-3 px-3 text-right">
                <div>9. Robustness</div>
                <div className="text-[10px] text-cyan-400 font-sans font-normal">↑ Higher</div>
              </th>
              <th className="py-3 px-3 text-center">
                <div>10. Steganalysis</div>
                <div className="text-[10px] text-amber-400 font-sans font-normal">↓ Lower</div>
              </th>
              <th className="py-3 px-2 text-center">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 font-mono">
            {results.map((r, idx) => {
              const isExpanded = expandedModelId === r.modelId;
              const isTop = r.modelId === 'ares_hybrid_inn';

              return (
                <React.Fragment key={r.modelId}>
                  <tr
                    className={`hover:bg-slate-800/40 transition cursor-pointer ${
                      isTop ? 'bg-cyan-950/20' : ''
                    } ${isExpanded ? 'bg-slate-800/60' : ''}`}
                    onClick={() => toggleExpand(r.modelId)}
                  >
                    {/* Model Name */}
                    <td className="py-3 px-3 font-sans font-medium text-slate-200">
                      <div className="flex items-center gap-1.5">
                        {isTop && (
                          <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400"></span>
                        )}
                        <span className="font-semibold text-slate-100">{r.modelName}</span>
                      </div>
                    </td>

                    {/* Param 1: PSNR */}
                    <td className="py-3 px-3 text-right font-bold text-cyan-300">
                      {r.psnr.toFixed(3)}
                    </td>

                    {/* Param 2: SSIM */}
                    <td className="py-3 px-3 text-right text-slate-200">
                      {r.ssim.toFixed(6)}
                    </td>

                    {/* Param 3: MSE */}
                    <td className="py-3 px-3 text-right text-slate-400">
                      {r.mse.toExponential(3)}
                    </td>

                    {/* Param 4: Capacity & Utilization */}
                    <td className="py-3 px-3 text-right text-slate-300">
                      <div>{r.payloadUtilizationPct.toFixed(2)}%</div>
                      <div className="text-[10px] text-slate-500 font-normal font-sans">
                        {r.bpp.toFixed(4)} bpp ({r.payloadSizeBytes} / {r.capacityBytes} B)
                      </div>
                    </td>

                    {/* Param 5: Recovery Accuracy & BER */}
                    <td className="py-3 px-3 text-center font-sans">
                      <div className="flex flex-col items-center gap-0.5">
                        {r.exactRecovery ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" /> PASS
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/20">
                            <XCircle className="h-3 w-3" /> FAIL
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-slate-400">
                          BER: {r.ber.toFixed(4)}
                        </span>
                      </div>
                    </td>

                    {/* Param 6: Embedding Time */}
                    <td className="py-3 px-3 text-right text-slate-300">
                      {r.embeddingTimeMs.toFixed(1)} ms
                    </td>

                    {/* Param 7: Decoding Time */}
                    <td className="py-3 px-3 text-right text-slate-300">
                      {r.decodingTimeMs.toFixed(1)} ms
                    </td>

                    {/* Param 8: Computational Resources */}
                    <td className="py-3 px-3 text-center">
                      <div className="text-[11px] text-slate-300">
                        {r.resourceUsage.cpuUsage?.replace('CPU ', '') || 'Client'}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[110px]">
                        {r.resourceUsage.ramUsage}
                      </div>
                    </td>

                    {/* Param 9: Robustness Under Attack */}
                    <td className="py-3 px-3 text-right font-semibold">
                      {r.robustnessRate !== null ? (
                        <span className={r.robustnessRate > 50 ? 'text-teal-300' : 'text-slate-400'}>
                          {r.robustnessRate.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">Not Run</span>
                      )}
                    </td>

                    {/* Param 10: Steganalysis Detectability */}
                    <td className="py-3 px-3 text-center">
                      {r.steganalysis.status === 'AVAILABLE' ? (
                        <div>
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                              r.steganalysis.detectionVerdict === 'UNDETECTED'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : r.steganalysis.detectionVerdict === 'SUSPECT'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {r.steganalysis.detectionVerdict}
                          </span>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                            {(r.steganalysis.stegoDetectProb * 100).toFixed(1)}%
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-500">N/A</span>
                      )}
                    </td>

                    {/* Expand Chevron */}
                    <td className="py-3 px-2 text-center text-slate-400">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 mx-auto text-cyan-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 mx-auto" />
                      )}
                    </td>
                  </tr>

                  {/* Expanded Row Detail View */}
                  {isExpanded && (
                    <tr className="bg-slate-950/80 border-b border-slate-800 font-sans">
                      <td colSpan={12} className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                          {/* Attack Robustness Suite Breakdown */}
                          <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-2">
                            <h5 className="font-semibold text-white flex items-center justify-between border-b border-slate-800 pb-1.5">
                              <span className="flex items-center gap-1.5">
                                <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />
                                Parameter 9 — Robustness Breakdown
                              </span>
                              <span className="font-mono text-teal-300">
                                {r.robustnessRate !== null ? `${r.robustnessRate.toFixed(1)}% Survived` : 'N/A'}
                              </span>
                            </h5>
                            {r.attackBreakdown && r.attackBreakdown.length > 0 ? (
                              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                {r.attackBreakdown.map((atk, aIdx) => (
                                  <div
                                    key={aIdx}
                                    className="flex items-center justify-between p-1.5 rounded bg-slate-950/70 border border-slate-800/80"
                                  >
                                    <div>
                                      <div className="font-medium text-slate-200">{atk.attackName}</div>
                                      <div className="text-[10px] text-slate-500">{atk.description}</div>
                                    </div>
                                    <div className="text-right">
                                      <span
                                        className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold ${
                                          atk.status === 'PASS'
                                            ? 'text-emerald-400 bg-emerald-950/40'
                                            : 'text-rose-400 bg-rose-950/40'
                                        }`}
                                      >
                                        {atk.status}
                                      </span>
                                      <div className="text-[10px] font-mono text-slate-400">
                                        BER: {atk.ber.toFixed(3)}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-slate-500 text-xs py-4 text-center">
                                Robustness attack suite not executed for this run.
                              </div>
                            )}
                          </div>

                          {/* Steganalysis Chi-Square Details */}
                          <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-2">
                            <h5 className="font-semibold text-white flex items-center justify-between border-b border-slate-800 pb-1.5">
                              <span className="flex items-center gap-1.5">
                                <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                                Parameter 10 — Steganalysis Detector
                              </span>
                              <span className="font-mono text-amber-300">
                                {r.steganalysis.detectionVerdict}
                              </span>
                            </h5>
                            <div className="space-y-2 text-xs">
                              <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800 space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Method:</span>
                                  <span className="font-mono text-slate-200 text-right">{r.steganalysis.methodName}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Cover Detection Rate:</span>
                                  <span className="font-mono text-emerald-400">{(r.steganalysis.coverDetectProb * 100).toFixed(1)}%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Stego Detection Rate:</span>
                                  <span className="font-mono text-amber-400">{(r.steganalysis.stegoDetectProb * 100).toFixed(1)}%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Chi-Square p-value:</span>
                                  <span className="font-mono text-slate-300">{r.steganalysis.pValue.toFixed(4)}</span>
                                </div>
                              </div>
                              <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/40 p-2 rounded border border-slate-800/60">
                                {r.steganalysis.note}
                              </p>
                            </div>
                          </div>

                          {/* Resource Context & Exact Payload Verification */}
                          <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-2">
                            <h5 className="font-semibold text-white flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
                              <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                              Parameter 8 — Resource & Extraction
                            </h5>
                            <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800 space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Device Platform:</span>
                                <span className="font-mono text-slate-200">{r.resourceUsage.device}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">GPU Renderer:</span>
                                <span className="font-mono text-slate-200 truncate max-w-[150px]">{r.resourceUsage.gpuModel}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Memory Footprint:</span>
                                <span className="font-mono text-slate-200">{r.resourceUsage.ramUsage}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">CPU Threads:</span>
                                <span className="font-mono text-slate-200">{r.resourceUsage.cpuUsage}</span>
                              </div>
                            </div>
                            {r.recoveredText && (
                              <div className="mt-2 bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                                <div className="text-[10px] text-slate-400 font-medium">Extracted Text Decoded:</div>
                                <div className="font-mono text-xs text-emerald-300 break-all mt-0.5 max-h-14 overflow-y-auto">
                                  "{r.recoveredText}"
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
