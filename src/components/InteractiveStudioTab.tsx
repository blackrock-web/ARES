import React, { useState, useRef } from 'react';
import { Sparkles, Lock, Unlock, Download, Upload, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  createSyntheticCover,
  embedSecret,
  extractSecret,
  computeMSE,
  computePSNR,
  computeSSIM,
  analyzeLSB,
  generateResidualDataUrl,
  generateLSBMapDataUrl
} from '../utils/stegoEngine';

export const InteractiveStudioTab: React.FC = () => {
  const [activeMode, setActiveMode] = useState<'EMBED' | 'EXTRACT'>('EMBED');

  // Embed State
  const [secretMessage, setSecretMessage] = useState<string>('Confidential payload embedded via ARES-Hybrid-INN');
  const [password, setPassword] = useState<string>('ares-key-2025');
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<string>('ares_hybrid_inn');
  const [coverUrl, setCoverUrl] = useState<string>('');
  const [stegoUrl, setStegoUrl] = useState<string>('');
  const [residualUrl, setResidualUrl] = useState<string>('');
  const [lsbMapUrl, setLsbMapUrl] = useState<string>('');
  const [metrics, setMetrics] = useState<{
    psnr: number;
    ssim: number;
    mse: number;
    lsbChangePct: number;
    payloadBits: number;
    exactRecovery: boolean;
  } | null>(null);

  // Extract State
  const [extractInputUrl, setExtractInputUrl] = useState<string>('');
  const [extractPassword, setExtractPassword] = useState<string>('ares-key-2025');
  const [extractAlgorithm, setExtractAlgorithm] = useState<string>('ares_hybrid_inn');
  const [extractedSecret, setExtractedSecret] = useState<{ text: string; success: boolean } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractFileInputRef = useRef<HTMLInputElement>(null);

  // Run embedding
  const handleEmbed = (imgSrc?: string) => {
    const src = imgSrc || coverUrl;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    let coverData: ImageData;

    const process = () => {
      coverData = ctx.getImageData(0, 0, 256, 256);
      setCoverUrl(canvas.toDataURL('image/png'));

      const res = embedSecret(coverData, secretMessage, selectedAlgorithm, password);

      const stegoCanvas = document.createElement('canvas');
      stegoCanvas.width = 256;
      stegoCanvas.height = 256;
      const stegoCtx = stegoCanvas.getContext('2d')!;
      stegoCtx.putImageData(res.stegoImgData, 0, 0);
      const stegoDataUrl = stegoCanvas.toDataURL('image/png');
      setStegoUrl(stegoDataUrl);

      // Extract input url auto-fill for quick testing
      setExtractInputUrl(stegoDataUrl);

      const mse = computeMSE(coverData, res.stegoImgData);
      const psnr = computePSNR(mse);
      const ssim = computeSSIM(coverData, res.stegoImgData);
      const lsb = analyzeLSB(coverData, res.stegoImgData);

      setResidualUrl(generateResidualDataUrl(coverData, res.stegoImgData, 12.0));
      setLsbMapUrl(generateLSBMapDataUrl(res.stegoImgData));

      setMetrics({
        psnr,
        ssim,
        mse,
        lsbChangePct: lsb.lsbChangePct,
        payloadBits: res.payloadBits,
        exactRecovery: res.exactRecovery
      });
    };

    if (!src || src === 'procedural') {
      coverData = createSyntheticCover(256);
      ctx.putImageData(coverData, 0, 0);
      process();
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 256, 256);
        process();
      };
      img.onerror = () => {
        coverData = createSyntheticCover(256);
        ctx.putImageData(coverData, 0, 0);
        process();
      };
      img.src = src;
    }
  };

  // Run extract
  const handleExtract = () => {
    if (!extractInputUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, img.width, img.height);

      const result = extractSecret(imgData, extractAlgorithm, extractPassword);
      setExtractedSecret(result);
    };
    img.src = extractInputUrl;
  };

  // Initialize on first render
  React.useEffect(() => {
    handleEmbed('procedural');
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-400" />
              <span>Interactive Steganography Studio</span>
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Live in-browser encoding & decoding sandbox with instant fidelity calculations and difference map inspection.
            </p>
          </div>

          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setActiveMode('EMBED')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
                activeMode === 'EMBED'
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              Embed Secret
            </button>
            <button
              onClick={() => setActiveMode('EXTRACT')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
                activeMode === 'EXTRACT'
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Unlock className="h-3.5 w-3.5" />
              Extract Secret
            </button>
          </div>
        </div>
      </div>

      {activeMode === 'EMBED' ? (
        /* EMBED MODE */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">
              Steganographic Encoding Parameters
            </h3>

            {/* Secret message */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Secret Text Payload
              </label>
              <textarea
                value={secretMessage}
                onChange={(e) => setSecretMessage(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Encryption / Permutation Key
              </label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Algorithm */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Steganography Algorithm
              </label>
              <select
                value={selectedAlgorithm}
                onChange={(e) => setSelectedAlgorithm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
              >
                <option value="ares_hybrid_inn">ARES-Hybrid-INN (Adaptive Minimum-LSB)</option>
                <option value="paper_model_03">Rahman LSB + Magic Matrix Permutation</option>
                <option value="paper_model_02">Sanjalawe Huffman + Sequential LSB</option>
                <option value="paper_model_01">Kanimozhi RNN+Fuzzy Spatial LSB</option>
              </select>
            </div>

            {/* Cover upload / reset */}
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2 px-3 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-300 flex items-center justify-center gap-1.5 transition"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload Cover
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    const reader = new FileReader();
                    reader.onload = (ev) => handleEmbed(ev.target?.result as string);
                    reader.readAsDataURL(f);
                  }
                }}
              />

              <button
                type="button"
                onClick={() => handleEmbed('procedural')}
                className="py-2 px-3 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-300"
              >
                Reset Cover
              </button>
            </div>

            {/* Run Button */}
            <button
              type="button"
              onClick={() => handleEmbed()}
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-950 transition flex items-center justify-center gap-2"
            >
              <Lock className="h-4 w-4" />
              Embed & Compute Fidelity
            </button>
          </div>

          {/* Results Visualizer */}
          <div className="lg:col-span-7 space-y-4">
            {metrics && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">
                    Live Steganographic Evaluation
                  </h4>
                  {metrics.exactRecovery ? (
                    <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      100% Exact Recovery Verified
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-medium">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Recovery Mismatch
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div className="text-[11px] text-slate-400">PSNR</div>
                    <div className="text-lg font-bold text-cyan-300 font-mono">
                      {metrics.psnr.toFixed(2)} dB
                    </div>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div className="text-[11px] text-slate-400">SSIM</div>
                    <div className="text-lg font-bold text-slate-100 font-mono">
                      {metrics.ssim.toFixed(6)}
                    </div>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div className="text-[11px] text-slate-400">MSE</div>
                    <div className="text-lg font-bold text-slate-100 font-mono">
                      {metrics.mse.toExponential(3)}
                    </div>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div className="text-[11px] text-slate-400">LSB Changed</div>
                    <div className="text-lg font-bold text-slate-100 font-mono">
                      {metrics.lsbChangePct.toFixed(2)}%
                    </div>
                  </div>
                </div>

                {/* Cover vs Stego vs Residual images */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="space-y-1 text-center">
                    <span className="text-[11px] text-slate-400 font-medium">Cover (Original)</span>
                    <img
                      src={coverUrl}
                      alt="Cover"
                      className="aspect-square w-full object-cover rounded-lg border border-slate-800 bg-slate-950"
                    />
                  </div>
                  <div className="space-y-1 text-center">
                    <span className="text-[11px] text-cyan-300 font-medium">Stego (Carrier)</span>
                    <img
                      src={stegoUrl}
                      alt="Stego"
                      className="aspect-square w-full object-cover rounded-lg border border-slate-800 bg-slate-950"
                    />
                  </div>
                  <div className="space-y-1 text-center">
                    <span className="text-[11px] text-amber-300 font-medium">Residual (×12)</span>
                    <img
                      src={residualUrl}
                      alt="Residual"
                      className="aspect-square w-full object-cover rounded-lg border border-slate-800 bg-slate-950"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <a
                    href={stegoUrl}
                    download="ares_stego_encoded.png"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download Stego Image (PNG)
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* EXTRACT MODE */
        <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Unlock className="h-4 w-4 text-cyan-400" />
            Extract Secret Message from Stego Image
          </h3>

          <div className="space-y-4">
            {/* Upload stego */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Stego Image
              </label>
              <div className="flex items-center gap-3">
                {extractInputUrl && (
                  <img
                    src={extractInputUrl}
                    alt="Stego to extract"
                    className="h-16 w-16 object-cover rounded-lg border border-slate-800 bg-slate-950"
                  />
                )}
                <button
                  type="button"
                  onClick={() => extractFileInputRef.current?.click()}
                  className="py-2 px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 flex items-center gap-1.5"
                >
                  <Upload className="h-4 w-4" />
                  Select Stego Image File
                </button>
                <input
                  ref={extractFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const reader = new FileReader();
                      reader.onload = (ev) => setExtractInputUrl(ev.target?.result as string);
                      reader.readAsDataURL(f);
                    }
                  }}
                />
              </div>
            </div>

            {/* Algorithm & Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Expected Algorithm
                </label>
                <select
                  value={extractAlgorithm}
                  onChange={(e) => setExtractAlgorithm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                >
                  <option value="ares_hybrid_inn">ARES-Hybrid-INN (Adaptive Minimum-LSB)</option>
                  <option value="paper_model_03">Rahman LSB + Magic Matrix</option>
                  <option value="paper_model_02">Sanjalawe Huffman + Sequential LSB</option>
                  <option value="paper_model_01">Kanimozhi RNN+Fuzzy Spatial LSB</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Key / Password
                </label>
                <input
                  type="text"
                  value={extractPassword}
                  onChange={(e) => setExtractPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleExtract}
              disabled={!extractInputUrl}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-md ${
                !extractInputUrl
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-950'
              }`}
            >
              <Unlock className="h-4 w-4" />
              Decode & Recover Secret Message
            </button>

            {/* Output */}
            {extractedSecret && (
              <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Recovery Status:</span>
                  {extractedSecret.success ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Extracted Successfully
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-rose-400 font-semibold">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Payload Extraction Failed
                    </span>
                  )}
                </div>

                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 font-mono text-xs text-slate-100 break-words">
                  {extractedSecret.success ? extractedSecret.text : 'Could not decode valid UTF-8 payload header.'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
