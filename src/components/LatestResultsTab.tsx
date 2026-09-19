import React, { useState } from 'react';
import { ShieldCheck, BarChart2, Image as ImageIcon, ExternalLink, ZoomIn, CheckCircle2 } from 'lucide-react';
import { RESEARCH_RUNS, LATEST_RUN_SUMMARY, BENCHMARK_IMAGE_IDS } from '../data/researchRuns';

export const LatestResultsTab: React.FC = () => {
  const [selectedRunId, setSelectedRunId] = useState<string>(RESEARCH_RUNS[0].id);
  const [selectedImageId, setSelectedImageId] = useState<string>('syn_0050');
  const [selectedModelForView, setSelectedModelForView] = useState<string>('ares_hybrid_inn');
  const [zoomModal, setZoomModal] = useState<{ url: string; title: string } | null>(null);

  const currentRun = RESEARCH_RUNS.find((r) => r.id === selectedRunId) || RESEARCH_RUNS[0];
  const summary = LATEST_RUN_SUMMARY;

  const modelsList = [
    { id: 'ares_hybrid_inn', name: 'ARES-Hybrid-INN', color: 'text-cyan-300' },
    { id: 'paper_model_01', name: 'Kanimozhi RNN+Fuzzy (2025)', color: 'text-blue-300' },
    { id: 'paper_model_04', name: 'Aljarf DL-Steg ECC+SAE (2025)', color: 'text-indigo-300' },
    { id: 'paper_model_03', name: 'Rahman LSB+MagicMatrix (2025)', color: 'text-purple-300' },
    { id: 'paper_model_02', name: 'Sanjalawe Huffman+LSB+DL (2025)', color: 'text-emerald-300' },
  ];

  const coverPath = `/results/${currentRun.id}/per_image/${selectedImageId}/cover.png`;
  const stegoPath = `/results/${currentRun.id}/per_image/${selectedImageId}/${selectedModelForView}_stego.png`;
  const residualPath = `/results/${currentRun.id}/per_image/${selectedImageId}/${selectedModelForView}_residual.png`;
  const lsbMapPath = `/results/${currentRun.id}/per_image/${selectedImageId}/${selectedModelForView}_lsb_map.png`;

  return (
    <div className="space-y-6">
      {/* Run Selector & Top Summary Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-cyan-400" />
              <h2 className="text-xl font-bold text-white tracking-tight">
                Precomputed Research Runs Inspector
              </h2>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Inspect aggregate statistics and image artifacts generated during full offline experimental runs.
            </p>
          </div>

          {/* Select Run */}
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

        {/* Run High-Level Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">Evaluation Dataset</div>
            <div className="text-sm font-bold text-slate-100 font-mono mt-0.5">
              20 Benchmark Images
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">Resolution</div>
            <div className="text-sm font-bold text-slate-100 font-mono mt-0.5">
              {currentRun.resolution} × {currentRun.resolution} px
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">Top PSNR Model</div>
            <div className="text-sm font-bold text-cyan-400 font-mono mt-0.5 truncate">
              {currentRun.bestModel} ({currentRun.bestPSNR})
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">True-Positive Rate</div>
            <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {currentRun.recoveryRate} (20/20)
            </div>
          </div>
        </div>
      </div>

      {/* Aggregate Statistics Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-cyan-400" />
            Statistical Significance & Distribution (N = 20 Test Images)
          </h3>
          <span className="text-xs text-slate-500 font-mono">Run: {currentRun.id}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono">
              <tr>
                <th className="py-2.5 px-3">Model</th>
                <th className="py-2.5 px-3 text-right">Mean PSNR (dB)</th>
                <th className="py-2.5 px-3 text-right">Median</th>
                <th className="py-2.5 px-3 text-right">Std</th>
                <th className="py-2.5 px-3 text-right">Min / Max</th>
                <th className="py-2.5 px-3 text-right">95% CI</th>
                <th className="py-2.5 px-3 text-right">% ≥ 75dB</th>
                <th className="py-2.5 px-3 text-right">Avg Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {summary.psnr_generalization.map((row, idx) => (
                <tr
                  key={row.model}
                  className={`hover:bg-slate-800/40 transition ${
                    row.model === 'ares_hybrid_inn' ? 'bg-cyan-950/20' : ''
                  }`}
                >
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-200">
                    <div className="flex items-center gap-1.5">
                      {row.model === 'ares_hybrid_inn' && (
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
                      )}
                      <span>{row.model_name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-cyan-300">
                    {row.mean_psnr.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300">
                    {row.median_psnr.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-400">
                    ±{row.std_psnr.toFixed(3)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-400">
                    {row.min_psnr.toFixed(1)} / {row.max_psnr.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300">
                    [{row.ci95_low.toFixed(2)}, {row.ci95_high.toFixed(2)}]
                  </td>
                  <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold">
                    {row.pct_ge_75.toFixed(0)}%
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-400">
                    {summary.aggregates[row.model]?.total_ms?.mean.toFixed(0) || '-'} ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-Image Artifact Inspector */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-cyan-400" />
              Per-Image Detailed Artifact Inspector
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Select any of the 20 benchmark test images to inspect Cover, Stego, Residual Difference (12×), and LSB Map.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedImageId}
              onChange={(e) => setSelectedImageId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            >
              {BENCHMARK_IMAGE_IDS.map((id) => (
                <option key={id} value={id}>
                  Test Image: {id}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Thumbnail Selector Bar */}
        <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-none">
          {BENCHMARK_IMAGE_IDS.map((id) => (
            <button
              key={id}
              onClick={() => setSelectedImageId(id)}
              className={`shrink-0 p-1 rounded-lg border text-center transition ${
                selectedImageId === id
                  ? 'border-cyan-500 bg-cyan-950/40 ring-1 ring-cyan-500/50'
                  : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
              }`}
            >
              <img
                src={`/results/${currentRun.id}/per_image/${id}/cover.png`}
                alt={id}
                className="h-12 w-12 object-cover rounded"
                onError={(e) => {
                  // If image path fails, show placeholder
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <span className="block text-[10px] font-mono text-slate-400 mt-0.5">{id}</span>
            </button>
          ))}
        </div>

        {/* Model Tabs for selected image */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-800 pb-3">
          {modelsList.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedModelForView(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                selectedModelForView === m.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-slate-700/60'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>

        {/* 4-Panel Grid: Cover, Stego, Residual (12x), LSB Map */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Panel 1: Cover */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">1. Original Cover</span>
              <span className="text-[10px] font-mono text-slate-500">256×256</span>
            </div>
            <div
              onClick={() => setZoomModal({ url: coverPath, title: `${selectedImageId} - Cover` })}
              className="aspect-square bg-slate-900 rounded-lg overflow-hidden relative group cursor-pointer border border-slate-800"
            >
              <img
                src={coverPath}
                alt="Cover"
                className="w-full h-full object-cover group-hover:scale-105 transition"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                <ZoomIn className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>

          {/* Panel 2: Stego */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-cyan-300">2. Stego Output</span>
              <span className="text-[10px] font-mono text-emerald-400">100% Recovery</span>
            </div>
            <div
              onClick={() => setZoomModal({ url: stegoPath, title: `${selectedImageId} - ${selectedModelForView} Stego` })}
              className="aspect-square bg-slate-900 rounded-lg overflow-hidden relative group cursor-pointer border border-slate-800"
            >
              <img
                src={stegoPath}
                alt="Stego"
                className="w-full h-full object-cover group-hover:scale-105 transition"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                <ZoomIn className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>

          {/* Panel 3: Residual Map */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-amber-300">3. Residual Difference (×12)</span>
              <span className="text-[10px] font-mono text-slate-500">Amplified</span>
            </div>
            <div
              onClick={() => setZoomModal({ url: residualPath, title: `${selectedImageId} - ${selectedModelForView} Residual` })}
              className="aspect-square bg-slate-900 rounded-lg overflow-hidden relative group cursor-pointer border border-slate-800"
            >
              <img
                src={residualPath}
                alt="Residual"
                className="w-full h-full object-cover group-hover:scale-105 transition"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                <ZoomIn className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>

          {/* Panel 4: LSB Map */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-indigo-300">4. LSB Bitplane Map</span>
              <span className="text-[10px] font-mono text-slate-500">Bit 0 Plane</span>
            </div>
            <div
              onClick={() => setZoomModal({ url: lsbMapPath, title: `${selectedImageId} - ${selectedModelForView} LSB Map` })}
              className="aspect-square bg-slate-900 rounded-lg overflow-hidden relative group cursor-pointer border border-slate-800"
            >
              <img
                src={lsbMapPath}
                alt="LSB Map"
                className="w-full h-full object-cover group-hover:scale-105 transition"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                <ZoomIn className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Zoom */}
      {zoomModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setZoomModal(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white font-mono">{zoomModal.title}</h4>
              <button
                type="button"
                onClick={() => setZoomModal(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>
            <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center p-2">
              <img
                src={zoomModal.url}
                alt="Zoom preview"
                className="max-h-[65vh] max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
