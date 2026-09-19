import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { LiveCompareTab } from './components/LiveCompareTab';
import { FullBenchmarkTab } from './components/FullBenchmarkTab';
import { LatestResultsTab } from './components/LatestResultsTab';
import { ModelsTab } from './components/ModelsTab';
import { InteractiveStudioTab } from './components/InteractiveStudioTab';
import { HowToRunTab } from './components/HowToRunTab';

export function App() {
  const [activeTab, setActiveTab] = useState<string>('live_compare');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500/20 selection:text-cyan-300">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'live_compare' && <LiveCompareTab />}
        {activeTab === 'full_benchmark' && <FullBenchmarkTab />}
        {activeTab === 'latest_results' && <LatestResultsTab />}
        {activeTab === 'models' && <ModelsTab />}
        {activeTab === 'interactive_studio' && <InteractiveStudioTab />}
        {activeTab === 'how_to_run' && <HowToRunTab />}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            ARES Universal-Condition Image Steganography Research Platform & Benchmark
          </div>
          <div className="flex items-center gap-4 text-slate-400 font-mono">
            <span>Version: 5.0.0 (Hybrid-INN)</span>
            <span>•</span>
            <a
              href="https://github.com/blackrock-web/ARES"
              target="_blank"
              rel="noreferrer"
              className="hover:text-cyan-400 transition"
            >
              GitHub Repository
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
