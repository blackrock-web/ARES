import React, { useState, useEffect } from 'react';
import { Upload, Play, CheckCircle2, XCircle, Award, Eye, Info, Sparkles, Sliders } from 'lucide-react';
import { MODEL_REGISTRY } from '../data/modelsData';
import { BenchmarkRowResult } from '../types';
import {
  createSyntheticCover,
  embedSecret,
  computeMSE,
  computePSNR,
  computeSSIM,
  analyzeLSB,
  generateResidualDataUrl,
  generateLSBMapDataUrl
} from '../utils/stegoEngine';

const PRESET_COVERS = [
  { id: 'syn_0050', label: 'Cover 0050', path: '/results/research_20260919_203322/per_image/syn_0050/cover.png' },
  { id: 'syn_0051', label: 'Cover 0051', path: '/results/research_20260919_203322/per_image/syn_0051/cover.png' },
  { id: 'syn_0052', label: 'Cover 0052', path: '/results/research_20260919_203322/per_image/syn_0052/cover.png' },
  { id: 'syn_0053', label: 'Cover 0053', path: '/results/research_20260919_203322/per_image/syn_0053/cover.png' },
  { id: 'syn_0054', label: 'Cover 0054', path: '/results/research_20260919_203322/per_image/syn_0054/cover.png' },
  { id: 'synthetic', label: 'Procedural Texture', path: 'procedural' },
];

export const LiveCompareTab: React.FC = () => {
  const [selectedCover, setSelectedCover] = useState<string>(PRESET_COVERS[0].path);
  const [customCoverUrl, setCustomCoverUrl] = useState<string | null>(null);
  const [secretText, setSecretText] = useState<string>('ARES live benchmark secret');
  const [imageSize, setImageSize] = useState<number>(256);
  const [onlyTruePositive, setOnlyTruePositive] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');

  // Results state
  const [coverDataUrl, setCoverDataUrl] = useState<string>('');
  const [results, setResults] = useState<BenchmarkRowResult[]>([]);
  const [bestModel, setBestModel] = useState<BenchmarkRowResult | null>(null);
  const [excludedList, setExcludedList] = useState<{ model: string; reason: string }[]>([]);
  const [selectedModalImage, setSelectedModalImage] = useState<{ url: string; title: string } | null>(null);

  // Load initial cover on mount
  useEffect(() => {
    runComparison();
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

  const runComparison = async () => {
    setIsRunning(true);
    setProgressText('Preparing cover image...');

    try {
      // 1. Create off-screen canvas to hold and resize cover
      const canvas = document.createElement('canvas');
      canvas.width = imageSize;
      canvas.height = imageSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not initialize canvas context');

      let coverImageData: ImageData;

      if (selectedCover === 'procedural') {
        coverImageData = createSyntheticCover(imageSize);
        ctx.putImageData(coverImageData, 0, 0);
      } else {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => {
            // Fallback to procedural if network image fails
            coverImageData = createSyntheticCover(imageSize);
            ctx.putImageData(coverImageData, 0, 0);
            resolve(null);
          };
          img.src = selectedCover;
        });

        if (img.width > 0) {
          ctx.drawImage(img, 0, 0, imageSize, imageSize);
          coverImageData = ctx.getImageData(0, 0, imageSize, imageSize);
        } else {
          coverImageData = createSyntheticCover(imageSize);
          ctx.putImageData(coverImageData, 0, 0);
        }
      }

      const currentCoverUrl = canvas.toDataURL('image/png');
      setCoverDataUrl(currentCoverUrl);

      // 2. Run models
      const modelsToRun = [
        { id: 'ares_hybrid_inn', name: 'ARES-Hybrid-INN', type: 'proposed' },
        { id: 'paper_model_01', name: 'Kanimozhi RNN+Fuzzy (2025)', type: 'paper' },
        { id: 'paper_model_02', name: 'Sanjalawe Huffman+LSB+DL (2025)', type: 'paper' },
        { id: 'paper_model_03', name: 'Rahman LSB+MagicMatrix (2025)', type: 'paper' },
        { id: 'paper_model_04', name: 'Aljarf DL-Steg ECC+SAE (2025)', type: 'paper' },
      ];

      const rows: BenchmarkRowResult[] = [];
      const excluded: { model: string; reason: string }[] = [];

      for (let i = 0; i < modelsToRun.length; i++) {
        const m = modelsToRun[i];
        setProgressText(`Evaluating ${m.name}...`);
        
        // Small delay to let UI render progress
        await new Promise(r => setTimeout(r, 20));

        const t0 = performance.now();
        try {
          const embedRes = embedSecret(coverImageData, secretText, m.id, 'benchmark');
          const elapsed = performance.now() - t0;

          // Put stego to canvas for dataURL
          const stegoCanvas = document.createElement('canvas');
          stegoCanvas.width = imageSize;
          stegoCanvas.height = imageSize;
          const stegoCtx = stegoCanvas.getContext('2d')!;
          stegoCtx.putImageData(embedRes.stegoImgData, 0, 0);
          const stegoDataUrl = stegoCanvas.toDataURL('image/png');

          // Metrics
          const mse = computeMSE(coverImageData, embedRes.stegoImgData);
          const psnr = computePSNR(mse);
          const ssim = computeSSIM(coverImageData, embedRes.stegoImgData);
          const lsbStats = analyzeLSB(coverImageData, embedRes.stegoImgData);
          const residualDataUrl = generateResidualDataUrl(coverImageData, embedRes.stegoImgData, 12.0);

          const row: BenchmarkRowResult = {
            modelId: m.id,
            modelName: m.name,
            status: embedRes.exactRecovery ? 'OK' : 'FAILED',
            psnr,
            ssim,
            mse,
            ms_ssim: ssim,
            bpp: embedRes.payloadBits / (imageSize * imageSize),
            truePositive: embedRes.exactRecovery,
            timeMs: Math.round(elapsed * 10) / 10,
            lsbChangePct: Math.round(lsbStats.lsbChangePct * 1000) / 1000,
            stegoDataUrl,
            residualDataUrl,
            recoveredText: embedRes.recoveredText,
          };

          if (!embedRes.exactRecovery) {
            excluded.push({ model: m.name, reason: 'Secret text recovery mismatch' });
            if (!onlyTruePositive) {
              rows.push(row);
            }
          } else {
            rows.push(row);
          }
        } catch (err: any) {
          excluded.push({ model: m.name, reason: err.message || 'Execution error' });
        }
      }

      // Sort by PSNR descending, then SSIM descending, then time ascending
      rows.sort((a, b) => {
        if (b.psnr !== a.psnr) return b.psnr - a.psnr;
        if (b.ssim !== a.ssim) return b.ssim - a.ssim;
        return a.timeMs - b.timeMs;
      });

      setResults(rows);
      setExcludedList(excluded);
      setBestModel(rows.length > 0 && rows[0].truePositive ? rows[0] : null);
    } catch (e: any) {
      console.error('Benchmark execution error:', e);
    } finally {
      setIsRunning(false);
      setProgressText('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>Live Single-Image Model Comparison</span>
              <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                Fair Condition Test
              </span>
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Compare <strong>ARES-Hybrid-INN</strong> against reproduced scientific paper baselines on the same cover and secret payload.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Strict True Positive (Exact Recovery)
            </span>
          </div>
        </div>
      </div>

      {/* Control Panel & Results Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Configuration Controls */}
        <div className="lg:col-span-4 space-y-5">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Sliders className="h-4 w-4 text-cyan-400" />
              Experiment Inputs
            </h3>

            {/* Cover Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Cover Image Presets
              </label>
              <div className="grid grid-cols-3 gap-2 mb-2">
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
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-semibold'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Upload custom */}
              <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:border-cyan-500/50 bg-slate-800/30 transition">
                <Upload className="h-4 w-4 text-slate-400 mb-1" />
                <span className="text-xs text-slate-300 font-medium">Or upload custom image</span>
                <span className="text-[11px] text-slate-500">PNG, JPG, WebP</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Cover Preview Thumbnail */}
            {coverDataUrl && (
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center gap-3">
                <img
                  src={coverDataUrl}
                  alt="Cover"
                  className="h-14 w-14 object-cover rounded-lg border border-slate-700 bg-slate-900"
                />
                <div className="text-xs overflow-hidden">
                  <div className="text-slate-300 font-medium truncate">Selected Cover</div>
                  <div className="text-slate-500 text-[11px] font-mono">{imageSize} × {imageSize} px</div>
                </div>
              </div>
            )}

            {/* Secret Payload Input */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Secret Payload Message
              </label>
              <textarea
                value={secretText}
                onChange={(e) => setSecretText(e.target.value)}
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
                placeholder="Enter secret text to embed..."
              />
              <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                <span>Length: {secretText.length} chars</span>
                <span>Bits: {secretText.length * 8 + 32} bits</span>
              </div>
            </div>

            {/* Resize Dropdown */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Fair Resolution Size
              </label>
              <select
                value={imageSize}
                onChange={(e) => setImageSize(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
              >
                <option value={128}>128 × 128 (Fast)</option>
                <option value={256}>256 × 256 (Standard Benchmark)</option>
                <option value={384}>384 × 384 (Detailed)</option>
                <option value={512}>512 × 512 (High Res)</option>
              </select>
            </div>

            {/* True Positive Only Switch */}
            <div className="pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyTruePositive}
                  onChange={(e) => setOnlyTruePositive(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
                />
                <span className="text-xs text-slate-300">
                  <strong>True Positive Only</strong>: Require exact secret text recovery to rank in table.
                </span>
              </label>
            </div>

            {/* Run Button */}
            <button
              type="button"
              onClick={runComparison}
              disabled={isRunning}
              className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold tracking-wide flex items-center justify-center gap-2 shadow-lg transition ${
                isRunning
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-900/30'
              }`}
            >
              <Play className="h-4 w-4 fill-current" />
              {isRunning ? progressText || 'Evaluating...' : 'RUN LIVE COMPARISON'}
            </button>
          </div>
        </div>

        {/* Right Column: Best Model Banner & Results Table */}
        <div className="lg:col-span-8 space-y-5">
          {/* Best Model Banner */}
          {bestModel ? (
            <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-850 border border-cyan-500/30 rounded-xl p-5 shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Award className="h-28 w-28 text-cyan-400" />
              </div>

              <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1">
                <Award className="h-4 w-4" />
                Best Model (True-Positive Recovery Winner)
              </div>

              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                <h3 className="text-2xl font-bold text-white font-mono">{bestModel.modelName}</h3>
                <div className="text-sm font-medium text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Exact 100% Secret Recovery
                </div>
              </div>

              {/* Metric stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800">
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[11px]">PSNR (Fidelity)</div>
                  <div className="text-lg font-bold text-cyan-300 font-mono">
                    {bestModel.psnr.toFixed(3)} <span className="text-xs font-normal text-slate-400">dB</span>
                  </div>
                </div>
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[11px]">SSIM Index</div>
                  <div className="text-lg font-bold text-slate-100 font-mono">
                    {bestModel.ssim.toFixed(6)}
                  </div>
                </div>
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[11px]">LSB Change %</div>
                  <div className="text-lg font-bold text-slate-100 font-mono">
                    {bestModel.lsbChangePct.toFixed(3)}%
                  </div>
                </div>
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[11px]">Compute Latency</div>
                  <div className="text-lg font-bold text-slate-100 font-mono">
                    {bestModel.timeMs.toFixed(1)} <span className="text-xs font-normal text-slate-400">ms</span>
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-slate-500" />
                <span>Ranking rule: 1) Exact recovery required → 2) Highest PSNR wins → 3) Higher SSIM → 4) Lowest latency.</span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center py-8">
              <Award className="h-10 w-10 text-slate-600 mx-auto mb-2" />
              <div className="text-slate-300 font-medium">No True-Positive Recovery Detected</div>
              <div className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Try using a larger cover image size (≥256px) or shorter secret text payload.
              </div>
            </div>
          )}

          {/* Results Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-200">
                Evaluation Metrics Breakdown
              </h4>
              <span className="text-xs text-slate-400">
                {results.length} model{results.length === 1 ? '' : 's'} ranked
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono">
                  <tr>
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Model</th>
                    <th className="py-2.5 px-3 text-right">PSNR ↑ (dB)</th>
                    <th className="py-2.5 px-3 text-right">SSIM ↑</th>
                    <th className="py-2.5 px-3 text-right">MSE ↓</th>
                    <th className="py-2.5 px-3 text-right">LSB %</th>
                    <th className="py-2.5 px-3 text-center">True +</th>
                    <th className="py-2.5 px-3 text-right">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {results.map((r, idx) => (
                    <tr
                      key={r.modelId}
                      className={`hover:bg-slate-800/40 transition ${
                        idx === 0 && r.truePositive ? 'bg-cyan-950/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-semibold text-slate-400">
                        #{idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-sans font-medium text-slate-200">
                        <div className="flex items-center gap-1.5">
                          {idx === 0 && r.truePositive && (
                            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
                          )}
                          <span>{r.modelName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-cyan-300">
                        {r.psnr.toFixed(3)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300">
                        {r.ssim.toFixed(6)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400">
                        {r.mse.toExponential(3)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300">
                        {r.lsbChangePct.toFixed(3)}%
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        {r.truePositive ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            TRUE +
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/20">
                            NO
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400">
                        {r.timeMs.toFixed(1)} ms
                      </td>
                    </tr>
                  ))}
                  {results.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-6 text-slate-500 font-sans">
                        No results available. Click "RUN LIVE COMPARISON" to execute.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Stego Output Gallery */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Eye className="h-4 w-4 text-cyan-400" />
            Cover & Stego Outputs Gallery
          </h3>
          <span className="text-xs text-slate-400">Click any image to inspect full size</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {/* Original Cover */}
          {coverDataUrl && (
            <div
              onClick={() => setSelectedModalImage({ url: coverDataUrl, title: 'Original Cover Image' })}
              className="group cursor-pointer bg-slate-950 p-2 rounded-xl border border-slate-800 hover:border-cyan-500/50 transition flex flex-col"
            >
              <div className="aspect-square w-full rounded-lg overflow-hidden bg-slate-900 mb-2 relative">
                <img
                  src={coverDataUrl}
                  alt="Cover"
                  className="w-full h-full object-cover group-hover:scale-105 transition"
                />
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-slate-900/80 text-[10px] font-mono text-cyan-300 border border-slate-700">
                  COVER
                </span>
              </div>
              <div className="text-xs font-medium text-slate-200 truncate">Original Cover</div>
              <div className="text-[11px] text-slate-500 font-mono">Reference Image</div>
            </div>
          )}

          {/* Stego outputs */}
          {results.map((r) => (
            <div
              key={`stego-${r.modelId}`}
              onClick={() => setSelectedModalImage({ url: r.stegoDataUrl || '', title: `${r.modelName} Stego (${r.psnr.toFixed(2)} dB)` })}
              className="group cursor-pointer bg-slate-950 p-2 rounded-xl border border-slate-800 hover:border-cyan-500/50 transition flex flex-col"
            >
              <div className="aspect-square w-full rounded-lg overflow-hidden bg-slate-900 mb-2 relative">
                {r.stegoDataUrl && (
                  <img
                    src={r.stegoDataUrl}
                    alt={r.modelName}
                    className="w-full h-full object-cover group-hover:scale-105 transition"
                  />
                )}
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-slate-900/80 text-[10px] font-mono text-emerald-300 border border-slate-700">
                  {r.psnr.toFixed(1)} dB
                </span>
              </div>
              <div className="text-xs font-medium text-slate-200 truncate">{r.modelName}</div>
              <div className="text-[11px] text-slate-500 font-mono">SSIM: {r.ssim.toFixed(4)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Residual Amplification Gallery */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            Amplified Residual Difference Maps (×12 Amplification)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Difference between Stego and Cover pixel values amplified by 12× to expose spatial embedding patterns.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {results.map((r) => (
            <div
              key={`residual-${r.modelId}`}
              onClick={() => setSelectedModalImage({ url: r.residualDataUrl || '', title: `${r.modelName} Residual Map (×12)` })}
              className="group cursor-pointer bg-slate-950 p-2 rounded-xl border border-slate-800 hover:border-cyan-500/50 transition flex flex-col"
            >
              <div className="aspect-square w-full rounded-lg overflow-hidden bg-slate-900 mb-2 relative">
                {r.residualDataUrl && (
                  <img
                    src={r.residualDataUrl}
                    alt={`${r.modelName} residual`}
                    className="w-full h-full object-cover group-hover:scale-105 transition"
                  />
                )}
              </div>
              <div className="text-xs font-medium text-slate-200 truncate">{r.modelName}</div>
              <div className="text-[11px] text-slate-500 font-mono">LSB Changed: {r.lsbChangePct.toFixed(2)}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Excluded Section if any */}
      {excludedList.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 text-xs">
          <div className="font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
            <XCircle className="h-4 w-4 text-amber-400" />
            Excluded from Rankings (Non True-Positive)
          </div>
          <ul className="list-disc list-inside space-y-1 text-slate-400">
            {excludedList.map((exc, i) => (
              <li key={i}>
                <span className="font-medium text-slate-300">{exc.model}</span>: {exc.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Image Zoom Modal */}
      {selectedModalImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedModalImage(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white font-mono">{selectedModalImage.title}</h4>
              <button
                type="button"
                onClick={() => setSelectedModalImage(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>
            <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center p-2">
              <img
                src={selectedModalImage.url}
                alt="Modal preview"
                className="max-h-[60vh] max-w-full object-contain rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <a
                href={selectedModalImage.url}
                download="stego_image.png"
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium"
              >
                Download PNG
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
