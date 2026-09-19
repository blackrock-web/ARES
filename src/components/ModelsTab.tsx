import React, { useState } from 'react';
import { BookOpen, ExternalLink, Cpu, ShieldAlert, Award, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { MODEL_REGISTRY } from '../data/modelsData';

export const ModelsTab: React.FC = () => {
  const [filter, setFilter] = useState<'ALL' | 'PROPOSED' | 'PAPER'>('ALL');
  const [expandedCard, setExpandedCard] = useState<string | null>('ares_hybrid_inn');

  const filteredModels = MODEL_REGISTRY.filter((m) => {
    if (filter === 'PROPOSED') return m.type === 'proposed';
    if (filter === 'PAPER') return m.type === 'paper';
    return true;
  });

  const toggleExpand = (id: string) => {
    setExpandedCard(expandedCard === id ? null : id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-cyan-400" />
              <span>Model Registry & Scientific Literature Baselines</span>
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Catalog of proposed ARES architectures and reproduced 2024–2025 peer-reviewed steganography papers.
            </p>
          </div>

          {/* Filter tabs */}
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-3 py-1 rounded-md transition font-medium ${
                filter === 'ALL' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              All (8)
            </button>
            <button
              onClick={() => setFilter('PROPOSED')}
              className={`px-3 py-1 rounded-md transition font-medium ${
                filter === 'PROPOSED' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              ARES Architectures (3)
            </button>
            <button
              onClick={() => setFilter('PAPER')}
              className={`px-3 py-1 rounded-md transition font-medium ${
                filter === 'PAPER' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              2025 Baselines (5)
            </button>
          </div>
        </div>
      </div>

      {/* Model Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredModels.map((model) => {
          const isExpanded = expandedCard === model.id;
          const isProposed = model.type === 'proposed';

          return (
            <div
              key={model.id}
              className={`bg-slate-900 border rounded-xl p-5 transition flex flex-col justify-between ${
                model.id === 'ares_hybrid_inn'
                  ? 'border-cyan-500/40 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/20 shadow-md shadow-cyan-950/30'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                {/* Header tag */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wider ${
                      isProposed
                        ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                        : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                    }`}
                  >
                    {isProposed ? 'Proposed Framework' : 'Scientific Baseline (2025)'}
                  </span>

                  <span className="text-xs font-mono text-slate-400">
                    Slot: <strong className="text-slate-200">{model.id}</strong>
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>{model.name}</span>
                  {model.id === 'ares_hybrid_inn' && (
                    <Award className="h-4 w-4 text-cyan-400" />
                  )}
                </h3>

                <p className="text-xs text-slate-400 mt-1 font-mono">
                  {model.architecture}
                </p>

                {/* Status Pills */}
                <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 font-mono">
                    Status: <span className="text-emerald-400 font-semibold">{model.status}</span>
                  </span>
                  {model.supports_gpu !== undefined && (
                    <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 font-mono">
                      GPU: {model.supports_gpu ? 'CUDA Supported' : 'CPU Native'}
                    </span>
                  )}
                  {model.default_bpp && (
                    <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 font-mono">
                      Payload: {model.default_bpp} bpp
                    </span>
                  )}
                </div>

                {/* Paper Details if applicable */}
                {model.paper && (
                  <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs space-y-1.5">
                    <div className="text-slate-300 font-medium line-clamp-2">
                      "{model.paper.title}"
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      {model.paper.authors} — <em className="text-slate-300">{model.paper.venue} ({model.paper.year})</em>
                    </div>
                    <div className="pt-1">
                      <a
                        href={`https://doi.org/${model.paper.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-mono"
                      >
                        <span>DOI: {model.paper.doi}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                )}

                {/* Expandable Deep Dive */}
                {isExpanded && (
                  <div className="mt-4 pt-3 border-t border-slate-800 text-xs space-y-2 bg-slate-950/60 p-3 rounded-lg">
                    {model.paper ? (
                      <>
                        <div>
                          <span className="font-semibold text-slate-300">Embedding Strategy: </span>
                          <span className="text-slate-400">{model.paper.embedding}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-300">Reported Metrics: </span>
                          <span className="text-slate-400 font-mono">
                            {JSON.stringify(model.paper.reported_metrics)}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-amber-400">Known Paper Limitations: </span>
                          <span className="text-slate-400">{model.paper.limitations}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="font-semibold text-slate-300">PyTorch Module: </span>
                          <span className="text-cyan-300 font-mono">{model.module}</span>
                        </div>
                        {model.weights && (
                          <div>
                            <span className="font-semibold text-slate-300">Trained Weights: </span>
                            <span className="text-slate-400 font-mono">{model.weights}</span>
                          </div>
                        )}
                        {model.ecc_modes && (
                          <div>
                            <span className="font-semibold text-slate-300">ECC Redundancy Modes: </span>
                            <span className="text-slate-400 font-mono">{model.ecc_modes.join(', ')}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Toggle expand button */}
              <button
                type="button"
                onClick={() => toggleExpand(model.id)}
                className="mt-4 pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 w-full transition"
              >
                <span>{isExpanded ? 'Collapse Architecture Specs' : 'View Architecture Specs & Limitations'}</span>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
