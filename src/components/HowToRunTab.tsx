import React from 'react';
import { Terminal, BookOpen, AlertTriangle, ShieldCheck, CheckCircle2, Code } from 'lucide-react';

export const HowToRunTab: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <Terminal className="h-5 w-5 text-cyan-400" />
          <span>Execution Guide & Research Protocol</span>
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Standardized commands and rigorous evaluation protocols for running, verifying, and reproducing ARES benchmark results.
        </p>
      </div>

      {/* Protocol Summary Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          Strict True-Positive Ranking Protocol
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          Steganography models cannot be ranked purely on visual imperceptibility (high PSNR/SSIM) if secret extraction is corrupted or degraded. The ARES evaluation protocol enforces:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="font-semibold text-cyan-300 block mb-1">Gate 1: Exact Recovery</span>
            <span className="text-slate-400">
              Payload must decode with 0% bit error rate (BER = 0.0) under test conditions.
            </span>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="font-semibold text-cyan-300 block mb-1">Gate 2: PSNR Optimization</span>
            <span className="text-slate-400">
              Higher peak signal-to-noise ratio indicates lower structural pixel deviation (dB).
            </span>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="font-semibold text-cyan-300 block mb-1">Gate 3: SSIM & Low Latency</span>
            <span className="text-slate-400">
              Structural similarity index near 1.0 and real-time per-frame latency (&lt;1000 ms).
            </span>
          </div>
        </div>
      </div>

      {/* CLI Commands */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Code className="h-4 w-4 text-cyan-400" />
          Command Line Interface (CLI) Benchmark Suite
        </h3>

        {/* Linux / macOS */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-slate-300">Linux / macOS:</span>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-cyan-300 overflow-x-auto">
            <code>
              # Run full 20-image benchmark suite at 256×256<br />
              python main.py run-benchmark --models ares_hybrid_inn paper_model_01 paper_model_02 paper_model_03 paper_model_04 --dataset synthetic --resolution 256<br /><br />
              # Start interactive Gradio / Web research dashboard<br />
              python main.py serve-ui --port 3000 --host 0.0.0.0
            </code>
          </div>
        </div>

        {/* Windows */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-slate-300">Windows PowerShell:</span>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-300 overflow-x-auto">
            <code>
              py main.py run-benchmark --models ares_hybrid_inn paper_model_01 --dataset synthetic --resolution 256<br />
              py main.py serve-ui --port 3000
            </code>
          </div>
        </div>
      </div>

      {/* Architecture Highlights */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">
          ARES-Hybrid-INN Architecture Novelty
        </h3>
        <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
          <li>
            <strong>Adaptive Minimum-LSB:</strong> Unlike traditional LSB replacement that flips bits indiscriminately, ARES checks existing parity and skips identical bits, halving total image disturbance.
          </li>
          <li>
            <strong>Blue-Channel & Texture Masking:</strong> Embeds preferentially in high-frequency texture and blue chromaticity channels where the human visual system (HVS) has minimal sensitivity.
          </li>
          <li>
            <strong>Invertible Neural Network (INN):</strong> Integrates reversible affine coupling layers for bijective secret message feature mapping and guaranteed lossless reconstruction.
          </li>
        </ul>
      </div>
    </div>
  );
};
