import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  BarChart2,
  Image as ImageIcon,
  Download,
  CheckCircle2,
  AlertCircle,
  FileText,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  Database
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { RESEARCH_RUNS, LATEST_RUN_SUMMARY, BENCHMARK_IMAGE_IDS } from '../data/researchRuns';
import {
  benchmarkStore,
  exportBenchmarkRunJSON,
  exportBenchmarkRunCSV,
  computeRunAggregates
} from '../utils/benchmarkStore';
import { BenchmarkRun } from '../types';

export const LatestResultsTab: React.FC = () => {
  // Live benchmark run from store
  const [liveRun, setLiveRun] = useState<BenchmarkRun | null>(() => benchmarkStore.getCurrentRun());

  // Offline reference run state
  const [selectedRunId, setSelectedRunId] = useState<string>(RESEARCH_RUNS[0].id);
  const [selectedImageId, setSelectedImageId] = useState<string>('syn_0050');
  const [selectedModelForView, setSelectedModelForView] = useState<string>('ares_hybrid_inn');
  const [zoomModal, setZoomModal] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    const unsub = benchmarkStore.subscribe((run) => {
      setLiveRun(run);
    });
    return unsub;
  }, []);

  const currentOfflineRun = RESEARCH_RUNS.find((r) => r.id === selectedRunId) || RESEARCH_RUNS[0];
  const summary = LATEST_RUN_SUMMARY;

  const modelsList = [
    { id: 'ares_hybrid_inn', name: 'ARES-Hybrid-INN (Proposed)', color: 'text-cyan-300' },
    { id: 'paper_model_01', name: 'Kanimozhi RNN+Fuzzy (2025)', color: 'text-blue-300' },
    { id: 'paper_model_04', name: 'Aljarf DL-Steg ECC+SAE (2025)', color: 'text-indigo-300' },
    { id: 'paper_model_03', name: 'Rahman LSB+MagicMatrix (2025)', color: 'text-purple-300' },
    { id: 'paper_model_02', name: 'Sanjalawe Huffman+LSB+DL (2025)', color: 'text-emerald-300' },
  ];

  // Aggregates for live run if present
  const liveAggregates = liveRun ? computeRunAggregates(liveRun.results, liveRun.modelIds) : null;

  return (
    <div className="space-y-6">
      {/* 1. Live Benchmark Reproduction Run Section */}
      {liveRun ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <h2 className="text-lg font-bold text-white font-mono">
                  Latest Reproduction Benchmark Run ({liveRun.runId})
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Timestamp: {new Date(liveRun.timestamp).toLocaleString()} • {liveRun.images.length} Images × {liveRun.modelIds.length} Models ({liveRun.summary.successful} successful, {liveRun.summary.failed + liveRun.summary.unavailable} failed/unavailable)
              </p>
            </div>

            {/* Action Export Buttons */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => exportBenchmarkRunJSON(liveRun)}
                className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition font-mono flex items-center gap-1.5 shadow-sm"
              >
                <FileText className="h-4 w-4" />
                Export JSON
              </button>
              <button
                onClick={() => exportBenchmarkRunCSV(liveRun)}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition font-mono border border-slate-700 flex items-center gap-1.5"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          {liveAggregates && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-[11px] text-slate-400 font-mono">Total Evaluations</div>
                <div className="text-base font-bold text-white font-mono mt-0.5">
                  {liveRun.results.length} Runs
                </div>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-[11px] text-slate-400 font-mono">Successful Executions</div>
                <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                  {liveRun.summary.successful} / {liveRun.summary.totalRequested}
                </div>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-[11px] text-slate-400 font-mono">Failed / Unavailable</div>
                <div className="text-base font-bold text-amber-400 font-mono mt-0.5">
                  {liveRun.summary.failed + liveRun.summary.unavailable}
                </div>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-[11px] text-slate-400 font-mono">Passphrase Status</div>
                <div className="text-base font-bold text-cyan-400 font-mono mt-0.5">
                  {liveRun.config.passphraseProvided ? 'Protected (Keyed)' : 'Default Key'}
                </div>
              </div>
            </div>
          )}

          {/* Model Summary Table */}
          {liveAggregates && (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Model</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Mean PSNR</th>
                    <th className="py-2.5 px-3 text-right">Mean SSIM</th>
                    <th className="py-2.5 px-3 text-right">Mean MSE</th>
                    <th className="py-2.5 px-3 text-right">Mean Encode (ms)</th>
                    <th className="py-2.5 px-3 text-right">Recovery Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {Object.values(liveAggregates).map((agg) => (
                    <tr key={agg.modelId} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-semibold text-slate-200">{agg.modelName}</td>
                      <td className="py-2.5 px-3 text-center">
                        {agg.successfulCount > 0 ? (
                          <span className="text-emerald-400 font-bold">{agg.successfulCount} OK</span>
                        ) : (
                          <span className="text-amber-400 font-medium">Unavailable</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-cyan-400 font-bold">
                        {agg.successfulCount > 0 ? `${agg.psnr.mean.toFixed(2)} dB` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300">
                        {agg.successfulCount > 0 ? agg.ssim.mean.toFixed(6) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400">
                        {agg.successfulCount > 0 ? agg.mse.mean.toFixed(5) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400">
                        {agg.successfulCount > 0 ? `${agg.encodeTimeMs.mean.toFixed(1)} ms` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                        {agg.totalTested > 0 ? `${agg.recoveryRatePct.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Database className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <div className="font-bold text-white text-sm">No Live Benchmark Run Executed Yet</div>
              <div className="text-xs text-slate-400">
                Execute the 5-Image × 6-Model test suite in the "Full Benchmark" tab to generate live evaluation results, or inspect precomputed literature runs below.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Precomputed Offline Research Runs Inspector */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-400" />
              <h2 className="text-base font-bold text-white tracking-tight font-mono">
                Precomputed Reference Research Runs (Offline Dataset N=20)
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Historical reference data from offline experimental GPU training runs on synthetic benchmark covers.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Select Run:</span>
            <select
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-500"
            >
              {RESEARCH_RUNS.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* High-Level Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium font-mono">Dataset</div>
            <div className="text-sm font-bold text-slate-100 font-mono mt-0.5">
              20 Benchmark Images
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium font-mono">Resolution</div>
            <div className="text-sm font-bold text-slate-100 font-mono mt-0.5">
              {currentOfflineRun.resolution} × {currentOfflineRun.resolution} px
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium font-mono">Top PSNR Model</div>
            <div className="text-sm font-bold text-cyan-400 font-mono mt-0.5 truncate">
              {currentOfflineRun.bestModel} ({currentOfflineRun.bestPSNR})
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium font-mono">True-Positive Rate</div>
            <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {currentOfflineRun.recoveryRate} (20/20)
            </div>
          </div>
        </div>

        {/* Statistical Significance Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Model</th>
                <th className="py-2.5 px-3 text-right">Mean PSNR</th>
                <th className="py-2.5 px-3 text-right">Median</th>
                <th className="py-2.5 px-3 text-right">Std</th>
                <th className="py-2.5 px-3 text-right">Min / Max</th>
                <th className="py-2.5 px-3 text-right">95% CI</th>
                <th className="py-2.5 px-3 text-right">% ≥ 75dB</th>
                <th className="py-2.5 px-3 text-right">Avg Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
              {summary.psnr_generalization.map((row) => (
                <tr key={row.model} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-3 font-semibold text-slate-200">{row.model}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-cyan-400">{row.mean} dB</td>
                  <td className="py-2.5 px-3 text-right text-slate-300">{row.median} dB</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">±{row.std}</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">{row.min} / {row.max}</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">{row.ci_95}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-emerald-400">{row.pct_above_75}</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">{row.avg_time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
