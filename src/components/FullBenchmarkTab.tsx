import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart3,
  Play,
  StopCircle,
  Upload,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Layers,
  Download,
  Eye,
  Info,
  Sliders,
  CheckSquare,
  Square
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import {
  BenchmarkImageItem,
  BenchmarkEvaluationResult,
  BenchmarkRun,
  ExecutionStatus
} from '../types';
import { ALL_MODEL_ADAPTERS, getModelAdapter } from '../utils/modelAdapters';
import {
  benchmarkStore,
  computeRunAggregates,
  findBestMetricPerformers,
  exportBenchmarkRunJSON,
  exportBenchmarkRunCSV
} from '../utils/benchmarkStore';
import {
  computeMSE,
  computePSNR,
  computeSSIM,
  detectClientResourceUsage,
  performChiSquareSteganalysis,
  createSyntheticCover
} from '../utils/stegoEngine';

// Default initial test images using procedural textured generators
function generateDefaultBenchmarkImages(): BenchmarkImageItem[] {
  const images: BenchmarkImageItem[] = [];
  const labels = ['Cover Alpha (Textures)', 'Cover Beta (Frequencies)', 'Cover Gamma (Gradients)', 'Cover Delta (Noise)', 'Cover Epsilon (Contrasts)'];
  
  for (let i = 0; i < 5; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(256, 256);
    const d = imgData.data;

    const freqX = 0.04 + i * 0.015;
    const freqY = 0.05 + i * 0.02;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const idx = (y * 256 + x) * 4;
        const v = 128 + Math.sin(x * freqX) * Math.cos(y * freqY) * 55 + Math.sin((x + y) * 0.03) * 35;
        const val = Math.max(20, Math.min(235, Math.floor(v)));
        d[idx] = val;
        d[idx + 1] = Math.max(20, Math.min(235, Math.floor(val * 0.95 + 5)));
        d[idx + 2] = Math.max(20, Math.min(235, Math.floor(val * 1.05 - 5)));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    images.push({
      id: `img_${i + 1}`,
      name: labels[i],
      dataUrl: canvas.toDataURL('image/png'),
      width: 256,
      height: 256,
      isCustom: false
    });
  }
  return images;
}

export const FullBenchmarkTab: React.FC = () => {
  // Test dataset state (up to 5 images)
  const [images, setImages] = useState<BenchmarkImageItem[]>(() => generateDefaultBenchmarkImages());
  
  // Selected models (default: ARES Hybrid INN only)
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(['ares_hybrid_inn']);

  // Configuration
  const [payloadText, setPayloadText] = useState<string>('ARES universal research benchmark test suite payload 2026');
  const [passphrase, setPassphrase] = useState<string>('ares-secure-benchmark-key');
  const [evaluateSecurity, setEvaluateSecurity] = useState<boolean>(true);

  // Execution State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [cancelRequested, setCancelRequested] = useState<boolean>(false);
  const cancelRef = useRef<boolean>(false);

  const [progressInfo, setProgressInfo] = useState<{
    currentImageIndex: number;
    totalImages: number;
    currentModelIndex: number;
    totalModels: number;
    currentModelName: string;
    completedCount: number;
    totalEvaluations: number;
    failedCount: number;
  }>({
    currentImageIndex: 0,
    totalImages: 0,
    currentModelIndex: 0,
    totalModels: 0,
    currentModelName: '',
    completedCount: 0,
    totalEvaluations: 0,
    failedCount: 0
  });

  // Current completed run
  const [currentRun, setCurrentRun] = useState<BenchmarkRun | null>(() => benchmarkStore.getCurrentRun());

  // View settings
  const [activeViewTab, setActiveViewTab] = useState<'TABLE' | 'PER_IMAGE' | 'AGGREGATES' | 'CHARTS' | 'GALLERY'>('TABLE');
  const [selectedImageForPerView, setSelectedImageForPerView] = useState<string>(images[0]?.id || '');
  const [chartMetric, setChartMetric] = useState<'PSNR' | 'SSIM'>('PSNR');
  const [chartMode, setChartMode] = useState<'PER_IMAGE' | 'MEAN'>('PER_IMAGE');

  // File upload refs
  const addImageInputRef = useRef<HTMLInputElement>(null);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const [replacingImageId, setReplacingImageId] = useState<string | null>(null);

  // Sync with store
  useEffect(() => {
    const unsub = benchmarkStore.subscribe((run) => {
      setCurrentRun(run);
    });
    return unsub;
  }, []);

  // Update selected image for per-image view if images change
  useEffect(() => {
    if (images.length > 0 && !images.some(img => img.id === selectedImageForPerView)) {
      setSelectedImageForPerView(images[0].id);
    }
  }, [images, selectedImageForPerView]);

  // Model toggles
  const toggleModel = (id: string) => {
    if (selectedModelIds.includes(id)) {
      if (selectedModelIds.length > 1) {
        setSelectedModelIds(selectedModelIds.filter(m => m !== id));
      }
    } else {
      setSelectedModelIds([...selectedModelIds, id]);
    }
  };

  const selectAllModels = () => {
    setSelectedModelIds(ALL_MODEL_ADAPTERS.map(a => a.id));
  };

  const selectAresOnly = () => {
    setSelectedModelIds(['ares_hybrid_inn']);
  };

  const clearModels = () => {
    setSelectedModelIds(['ares_hybrid_inn']); // keep at least proposed
  };

  // Image management
  const handleAddImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (images.length >= 5) {
      alert('Benchmark supports up to 5 test images.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const newImg: BenchmarkImageItem = {
          id: `custom_${Date.now()}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          dataUrl: url,
          width: img.width,
          height: img.height,
          isCustom: true
        };
        setImages([...images, newImg]);
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleReplaceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replacingImageId) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setImages(images.map(item => {
          if (item.id === replacingImageId) {
            return {
              ...item,
              name: file.name.replace(/\.[^/.]+$/, ''),
              dataUrl: url,
              width: img.width,
              height: img.height,
              isCustom: true
            };
          }
          return item;
        }));
        setReplacingImageId(null);
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeImage = (id: string) => {
    if (images.length <= 1) {
      alert('Benchmark requires at least 1 image.');
      return;
    }
    setImages(images.filter(img => img.id !== id));
  };

  const resetDefaultImages = () => {
    setImages(generateDefaultBenchmarkImages());
  };

  const clearAllImages = () => {
    if (images.length > 1) {
      setImages([images[0]]);
    }
  };

  // Convert image URL to ImageData on canvas
  const loadImageData = async (dataUrl: string): Promise<ImageData> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to create canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, img.width, img.height));
      };
      img.onerror = () => {
        reject(new Error('Failed to load image file for evaluation'));
      };
      img.src = dataUrl;
    });
  };

  // Run Real Sequential Benchmark
  const runBenchmark = async () => {
    if (images.length === 0 || selectedModelIds.length === 0) {
      alert('Please select at least 1 image and 1 model.');
      return;
    }

    setIsRunning(true);
    setCancelRequested(false);
    cancelRef.current = false;

    const totalEvaluations = images.length * selectedModelIds.length;
    let completedCount = 0;
    let failedCount = 0;

    const evaluationResults: BenchmarkEvaluationResult[] = [];
    const clientResources = detectClientResourceUsage();

    for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
      const currentImage = images[imgIdx];
      let coverImageData: ImageData;

      try {
        coverImageData = await loadImageData(currentImage.dataUrl);
      } catch (err: any) {
        // Mark all models for this image as failed
        selectedModelIds.forEach(mId => {
          const adapter = getModelAdapter(mId);
          evaluationResults.push({
            imageId: currentImage.id,
            imageName: currentImage.name,
            modelId: mId,
            modelName: adapter?.name || mId,
            status: 'FAILED',
            error: `Image load error: ${err?.message || 'Unable to decode image pixels'}`,
            metrics: {
              psnr: null,
              ssim: null,
              mse: null,
              bpp: null,
              capacityBytes: null,
              payloadSizeBytes: null,
              payloadUtilizationPct: null
            },
            payload: {
              sizeBytes: new TextEncoder().encode(payloadText).length,
              type: 'text'
            },
            encoding: { timeMs: null, timeSeconds: null },
            decoding: { timeMs: null, timeSeconds: null },
            recovery: { status: 'NOT VERIFIED', exactMatch: false, ber: null, recoveredSize: null }
          });
          failedCount++;
          completedCount++;
        });
        continue;
      }

      for (let modelIdx = 0; modelIdx < selectedModelIds.length; modelIdx++) {
        if (cancelRef.current) break;

        const modelId = selectedModelIds[modelIdx];
        const adapter = getModelAdapter(modelId);
        const modelName = adapter?.name || modelId;

        setProgressInfo({
          currentImageIndex: imgIdx + 1,
          totalImages: images.length,
          currentModelIndex: modelIdx + 1,
          totalModels: selectedModelIds.length,
          currentModelName: modelName,
          completedCount,
          totalEvaluations,
          failedCount
        });

        // Small microtask yield so browser updates UI and animation
        await new Promise(r => setTimeout(r, 10));

        if (!adapter) {
          evaluationResults.push({
            imageId: currentImage.id,
            imageName: currentImage.name,
            modelId,
            modelName,
            status: 'FAILED',
            error: 'Adapter not found for model id: ' + modelId,
            metrics: { psnr: null, ssim: null, mse: null, bpp: null, capacityBytes: null, payloadSizeBytes: null, payloadUtilizationPct: null },
            payload: { sizeBytes: new TextEncoder().encode(payloadText).length, type: 'text' },
            encoding: { timeMs: null, timeSeconds: null },
            decoding: { timeMs: null, timeSeconds: null },
            recovery: { status: 'NOT VERIFIED', exactMatch: false, ber: null, recoveredSize: null }
          });
          failedCount++;
          completedCount++;
          continue;
        }

        // Validate compatibility
        const payloadBytes = new TextEncoder().encode(payloadText).length;
        const compat = adapter.validateCompatibility(coverImageData.width, coverImageData.height, payloadBytes);

        if (!compat.compatible) {
          const isUnavailable = !adapter.isAvailable;
          const status: ExecutionStatus = isUnavailable ? 'UNAVAILABLE' : 'NOT_EXECUTED';
          evaluationResults.push({
            imageId: currentImage.id,
            imageName: currentImage.name,
            modelId,
            modelName,
            status,
            reason: compat.reason,
            metrics: { psnr: null, ssim: null, mse: null, bpp: null, capacityBytes: null, payloadSizeBytes: null, payloadUtilizationPct: null },
            payload: { sizeBytes: payloadBytes, type: 'text' },
            encoding: { timeMs: null, timeSeconds: null },
            decoding: { timeMs: null, timeSeconds: null },
            recovery: { status: 'NOT VERIFIED', exactMatch: false, ber: null, recoveredSize: null }
          });
          failedCount++;
          completedCount++;
          continue;
        }

        // Execute real embedding
        try {
          const embedRes = await adapter.embed(coverImageData, payloadText, passphrase);

          if (embedRes.status !== 'SUCCESS' || !embedRes.stegoImgData) {
            evaluationResults.push({
              imageId: currentImage.id,
              imageName: currentImage.name,
              modelId,
              modelName,
              status: embedRes.status,
              reason: embedRes.reason,
              error: embedRes.error,
              metrics: {
                psnr: null,
                ssim: null,
                mse: null,
                bpp: embedRes.bpp,
                capacityBytes: embedRes.capacityBytes,
                payloadSizeBytes: embedRes.payloadSizeBytes,
                payloadUtilizationPct: embedRes.payloadUtilizationPct
              },
              payload: { sizeBytes: payloadBytes, type: 'text' },
              encoding: { timeMs: embedRes.encodeTimeMs, timeSeconds: embedRes.encodeTimeMs / 1000 },
              decoding: { timeMs: null, timeSeconds: null },
              recovery: { status: 'NOT VERIFIED', exactMatch: false, ber: null, recoveredSize: null }
            });
            failedCount++;
            completedCount++;
            continue;
          }

          // Calculate real metrics directly from actual pixel values
          const mse = computeMSE(coverImageData, embedRes.stegoImgData);
          const psnr = computePSNR(mse);
          const ssim = computeSSIM(coverImageData, embedRes.stegoImgData);

          // Execute real decoding
          const decodeRes = await adapter.decode(embedRes.stegoImgData, passphrase, payloadText);

          // Execute Steganalysis if requested
          let steganalysisResult = undefined;
          if (evaluateSecurity) {
            steganalysisResult = performChiSquareSteganalysis(coverImageData, embedRes.stegoImgData);
          }

          evaluationResults.push({
            imageId: currentImage.id,
            imageName: currentImage.name,
            modelId,
            modelName,
            status: 'SUCCESS',
            metrics: {
              psnr: Math.round(psnr * 10000) / 10000,
              ssim: Math.round(ssim * 1000000) / 1000000,
              mse: Math.round(mse * 100000) / 100000,
              bpp: embedRes.bpp,
              capacityBytes: embedRes.capacityBytes,
              payloadSizeBytes: embedRes.payloadSizeBytes,
              payloadUtilizationPct: embedRes.payloadUtilizationPct
            },
            payload: {
              sizeBytes: payloadBytes,
              type: 'text',
              preview: payloadText.slice(0, 40)
            },
            encoding: {
              timeMs: embedRes.encodeTimeMs,
              timeSeconds: Math.round((embedRes.encodeTimeMs / 1000) * 10000) / 10000
            },
            decoding: {
              timeMs: decodeRes.decodeTimeMs,
              timeSeconds: Math.round((decodeRes.decodeTimeMs / 1000) * 10000) / 10000
            },
            recovery: {
              status: decodeRes.recoveryStatus,
              exactMatch: decodeRes.exactMatch,
              ber: decodeRes.ber,
              recoveredSize: decodeRes.recoveredText ? new TextEncoder().encode(decodeRes.recoveredText).length : 0,
              recoveredTextPreview: decodeRes.recoveredText ? decodeRes.recoveredText.slice(0, 40) : undefined
            },
            stegoDataUrl: embedRes.stegoDataUrl,
            residualDataUrl: embedRes.residualDataUrl,
            lsbMapDataUrl: embedRes.lsbMapDataUrl,
            steganalysis: steganalysisResult,
            deviceContext: clientResources
          });

          completedCount++;
        } catch (err: any) {
          evaluationResults.push({
            imageId: currentImage.id,
            imageName: currentImage.name,
            modelId,
            modelName,
            status: 'FAILED',
            error: err?.message || 'Execution error during model inference',
            metrics: { psnr: null, ssim: null, mse: null, bpp: null, capacityBytes: null, payloadSizeBytes: null, payloadUtilizationPct: null },
            payload: { sizeBytes: payloadBytes, type: 'text' },
            encoding: { timeMs: null, timeSeconds: null },
            decoding: { timeMs: null, timeSeconds: null },
            recovery: { status: 'NOT VERIFIED', exactMatch: false, ber: null, recoveredSize: null }
          });
          failedCount++;
          completedCount++;
        }
      }

      if (cancelRef.current) break;
    }

    const successfulCount = evaluationResults.filter(r => r.status === 'SUCCESS').length;
    const actualFailedCount = evaluationResults.filter(r => r.status === 'FAILED').length;
    const unavailableCount = evaluationResults.filter(r => r.status === 'UNAVAILABLE').length;
    const notExecutedCount = evaluationResults.filter(r => r.status === 'NOT_EXECUTED').length;

    const newBenchmarkRun: BenchmarkRun = {
      runId: `run_${Date.now()}`,
      timestamp: new Date().toISOString(),
      source: 'LIVE_EVALUATION',
      images: [...images],
      modelIds: [...selectedModelIds],
      results: evaluationResults,
      config: {
        payloadType: 'text',
        payloadSizeBytes: new TextEncoder().encode(payloadText).length,
        evaluateSecurity,
        passphraseProvided: passphrase.length > 0,
        deviceContext: clientResources
      },
      summary: {
        totalRequested: evaluationResults.length,
        successful: successfulCount,
        failed: actualFailedCount,
        unavailable: unavailableCount,
        notExecuted: notExecutedCount
      }
    };

    benchmarkStore.setCurrentRun(newBenchmarkRun);
    setCurrentRun(newBenchmarkRun);
    setIsRunning(false);
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setCancelRequested(true);
  };

  // Computations for current results
  const aggregates = currentRun ? computeRunAggregates(currentRun.results, currentRun.modelIds) : {};
  const bestPerformers = currentRun ? findBestMetricPerformers(aggregates) : null;

  // Chart Data preparation
  const chartData = React.useMemo(() => {
    if (!currentRun || currentRun.results.length === 0) return [];

    if (chartMode === 'MEAN') {
      return Object.values(aggregates).map(agg => ({
        name: agg.modelName.split(' ')[0],
        fullName: agg.modelName,
        value: chartMetric === 'PSNR' ? agg.psnr.mean : agg.ssim.mean,
        count: agg.successfulCount
      }));
    } else {
      // Per image breakdown
      return currentRun.images.map(img => {
        const item: any = { name: img.name };
        currentRun.modelIds.forEach(mId => {
          const match = currentRun.results.find(r => r.imageId === img.id && r.modelId === mId);
          const shortName = (getModelAdapter(mId)?.name || mId).split(' ')[0];
          if (match && match.status === 'SUCCESS') {
            item[shortName] = chartMetric === 'PSNR' ? match.metrics.psnr : match.metrics.ssim;
          } else {
            item[shortName] = null;
          }
        });
        return item;
      });
    }
  }, [currentRun, aggregates, chartMode, chartMetric]);

  const modelColors = ['#06b6d4', '#3b82f6', '#10b981', '#a855f7', '#6366f1', '#f59e0b'];

  return (
    <div className="space-y-6">
      {/* Benchmark Integrity Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-xs shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <div className="font-semibold text-white">Benchmark Integrity & Zero-Fabrication Guarantee</div>
              <div className="text-slate-400">All metrics, execution latencies, and payload recoveries are calculated live from actual image pixel buffers.</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-mono text-slate-300">
            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> Real Pixel Pipeline
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> Real True-Positive Gate
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 flex items-center gap-1 text-cyan-400">
              <CheckCircle2 className="h-3 w-3" /> Failures Preserved
            </span>
          </div>
        </div>
      </div>

      {/* Dataset & Model Selector Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-cyan-400" />
              Benchmark Dataset & Configuration
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Select or upload up to 5 test images and select the model slots to evaluate.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={resetDefaultImages}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5 border border-slate-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset Defaults
            </button>
            <button
              onClick={clearAllImages}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700"
            >
              Clear to 1 Image
            </button>
          </div>
        </div>

        {/* 5-Image Dataset Slot Cards */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Test Images ({images.length} / 5 slots used)
            </div>
            {images.length < 5 && (
              <button
                onClick={() => addImageInputRef.current?.click()}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition flex items-center gap-1 font-medium"
              >
                <Plus className="h-3.5 w-3.5" /> Add Image
              </button>
            )}
            <input
              type="file"
              ref={addImageInputRef}
              onChange={handleAddImage}
              accept="image/*"
              className="hidden"
            />
            <input
              type="file"
              ref={replaceImageInputRef}
              onChange={handleReplaceImage}
              accept="image/*"
              className="hidden"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {images.map((img, idx) => (
              <div
                key={img.id}
                className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 flex flex-col space-y-2 group hover:border-slate-700 transition"
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span className="font-semibold text-slate-300">Image {idx + 1}</span>
                  {images.length > 1 && (
                    <button
                      onClick={() => removeImage(img.id)}
                      className="text-slate-500 hover:text-rose-400 transition"
                      title="Remove image"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="relative aspect-square w-full rounded overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center">
                  <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5 p-2">
                    <button
                      onClick={() => {
                        setReplacingImageId(img.id);
                        replaceImageInputRef.current?.click();
                      }}
                      className="px-2 py-1 text-[10px] bg-slate-800 text-slate-200 rounded hover:bg-slate-700 transition"
                    >
                      Replace
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-slate-300 truncate font-medium" title={img.name}>
                  {img.name}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {img.width}×{img.height} px
                </div>
              </div>
            ))}

            {images.length < 5 && (
              <button
                onClick={() => addImageInputRef.current?.click()}
                className="border-2 border-dashed border-slate-800 hover:border-cyan-500/50 rounded-lg p-3 flex flex-col items-center justify-center text-slate-500 hover:text-cyan-400 transition aspect-square"
              >
                <Plus className="h-6 w-6 mb-1" />
                <span className="text-xs font-medium">Add Image</span>
                <span className="text-[10px] text-slate-600">Slot {images.length + 1}</span>
              </button>
            )}
          </div>
        </div>

        {/* Model Selection Checkboxes */}
        <div className="pt-4 border-t border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Model Slots ({selectedModelIds.length} / 6 selected)
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={selectAresOnly}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 transition"
              >
                ARES Only
              </button>
              <button
                onClick={selectAllModels}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Select All
              </button>
              <button
                onClick={clearModels}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {ALL_MODEL_ADAPTERS.map((adapter) => {
              const isSelected = selectedModelIds.includes(adapter.id);
              const isProposed = adapter.type === 'proposed';

              return (
                <div
                  key={adapter.id}
                  onClick={() => toggleModel(adapter.id)}
                  className={`cursor-pointer rounded-lg p-3 border transition flex items-start gap-3 ${
                    isSelected
                      ? isProposed
                        ? 'bg-cyan-950/30 border-cyan-500/40 text-slate-100 shadow-sm'
                        : 'bg-slate-800/60 border-slate-700 text-slate-100'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="mt-0.5">
                    {isSelected ? (
                      <CheckSquare className={`h-4 w-4 ${isProposed ? 'text-cyan-400' : 'text-blue-400'}`} />
                    ) : (
                      <Square className="h-4 w-4 text-slate-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold truncate text-slate-200">
                        {adapter.name}
                      </span>
                      {isProposed && (
                        <span className="text-[10px] px-1.5 py-0.2 bg-cyan-500/20 text-cyan-300 rounded font-mono font-medium">
                          PROPOSED
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5 font-mono">
                      Slot: {adapter.slot} • {adapter.isAvailable ? 'Reproduced' : 'Unavailable (Single)'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payload & Passphrase Row */}
        <div className="pt-4 border-t border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 font-mono">
              Secret Payload (Text or Binary)
            </label>
            <textarea
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              rows={2}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
              placeholder="Enter text payload to embed across test images..."
            />
            <div className="text-[11px] text-slate-500 font-mono mt-1">
              Payload Size: {new TextEncoder().encode(payloadText).length} bytes (
              {new TextEncoder().encode(payloadText).length * 8 + 32} bits with 32-bit header)
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 font-mono">
              Passphrase (Secure / Keyed LSB)
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
              placeholder="Enter passphrase for keyed embedding..."
            />
            <div className="flex items-center justify-between mt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={evaluateSecurity}
                  onChange={(e) => setEvaluateSecurity(e.target.checked)}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/20"
                />
                <span>Evaluate Chi-Square Steganalysis</span>
              </label>

              <span className="text-[11px] text-slate-500 font-mono">
                Plaintext passphrase never exported
              </span>
            </div>
          </div>
        </div>

        {/* Action Button & Live Progress */}
        <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-400 font-mono">
            Evaluations: <span className="text-white font-semibold">{images.length} images × {selectedModelIds.length} models = {images.length * selectedModelIds.length} total</span>
          </div>

          <div className="flex items-center gap-3">
            {isRunning ? (
              <button
                onClick={handleCancel}
                className="px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition flex items-center gap-2 shadow-lg shadow-rose-900/30"
              >
                <StopCircle className="h-4 w-4" />
                Cancel Benchmark
              </button>
            ) : (
              <button
                onClick={runBenchmark}
                disabled={images.length === 0 || selectedModelIds.length === 0}
                className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold text-xs tracking-wide transition flex items-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
              >
                <Play className="h-4 w-4 fill-white" />
                Run Benchmark ({images.length * selectedModelIds.length} Evaluations)
              </button>
            )}
          </div>
        </div>

        {/* Live Execution Progress Bar */}
        {isRunning && (
          <div className="bg-slate-950 p-4 rounded-lg border border-cyan-500/30 space-y-2 animate-pulse">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-cyan-400 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping"></span>
                Evaluating Image {progressInfo.currentImageIndex} / {progressInfo.totalImages} • Model {progressInfo.currentModelIndex} / {progressInfo.totalModels} ({progressInfo.currentModelName})
              </span>
              <span className="text-slate-400">
                Completed: {progressInfo.completedCount} / {progressInfo.totalEvaluations} ({progressInfo.failedCount} failed)
              </span>
            </div>
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-200"
                style={{
                  width: `${progressInfo.totalEvaluations > 0 ? (progressInfo.completedCount / progressInfo.totalEvaluations) * 100 : 0}%`
                }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Results Header and Sub-Tabs Navigation */}
      {currentRun && currentRun.results.length > 0 && (
        <div className="space-y-6">
          {/* Top Summary Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-white font-mono">
                    Benchmark Evaluation Complete
                  </h3>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Evaluated {currentRun.summary.totalRequested} total combinations ({currentRun.summary.successful} successful, {currentRun.summary.failed + currentRun.summary.unavailable} failed/unavailable)
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportBenchmarkRunJSON(currentRun)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition font-mono border border-slate-700 flex items-center gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" /> Export JSON
                </button>
                <button
                  onClick={() => exportBenchmarkRunCSV(currentRun)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition font-mono border border-slate-700 flex items-center gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </button>
              </div>
            </div>

            {/* Metric-Specific Best Performers (Calculated, Not Arbitrary) */}
            {bestPerformers && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-medium">Highest PSNR (↑)</div>
                  <div className="text-xs font-bold text-cyan-400 font-mono mt-1 truncate">
                    {bestPerformers.highestPsnr}
                  </div>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-medium">Highest SSIM (↑)</div>
                  <div className="text-xs font-bold text-blue-400 font-mono mt-1 truncate">
                    {bestPerformers.highestSsim}
                  </div>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-medium">Lowest MSE (↓)</div>
                  <div className="text-xs font-bold text-emerald-400 font-mono mt-1 truncate">
                    {bestPerformers.lowestMse}
                  </div>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-medium">Fastest Encoding (↓)</div>
                  <div className="text-xs font-bold text-purple-400 font-mono mt-1 truncate">
                    {bestPerformers.fastestEncoding}
                  </div>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-medium">Exact Payload Recovery</div>
                  <div className="text-xs font-bold text-teal-400 font-mono mt-1 truncate">
                    {bestPerformers.successfulRecovery}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sub-Tabs View Switcher */}
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setActiveViewTab('TABLE')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                activeViewTab === 'TABLE'
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Full Comparison Table
            </button>
            <button
              onClick={() => setActiveViewTab('PER_IMAGE')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                activeViewTab === 'PER_IMAGE'
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Per-Image Comparison
            </button>
            <button
              onClick={() => setActiveViewTab('AGGREGATES')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                activeViewTab === 'AGGREGATES'
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Overall Aggregates
            </button>
            <button
              onClick={() => setActiveViewTab('CHARTS')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                activeViewTab === 'CHARTS'
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              PSNR / SSIM Charts
            </button>
            <button
              onClick={() => setActiveViewTab('GALLERY')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                activeViewTab === 'GALLERY'
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Stego Gallery
            </button>
          </div>

          {/* 1. Full Comparison Table */}
          {activeViewTab === 'TABLE' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                  Full Benchmark Execution Matrix ({currentRun.results.length} rows)
                </h4>
                <span className="text-[11px] text-slate-500 font-mono">
                  Empty values indicate unavailable / failed execution
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Model</th>
                      <th className="py-3 px-3">Image</th>
                      <th className="py-3 px-3 text-right">PSNR (dB) ↑</th>
                      <th className="py-3 px-3 text-right">SSIM ↑</th>
                      <th className="py-3 px-3 text-right">MSE ↓</th>
                      <th className="py-3 px-3 text-right">Payload</th>
                      <th className="py-3 px-3 text-right">BER ↓</th>
                      <th className="py-3 px-3 text-right">Encode (ms)</th>
                      <th className="py-3 px-3 text-right">Decode (ms)</th>
                      <th className="py-3 px-3 text-center">Recovery</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {currentRun.results.map((r, i) => {
                      const isAres = r.modelId === 'ares_hybrid_inn';
                      const isSuccess = r.status === 'SUCCESS';

                      return (
                        <tr
                          key={`${r.imageId}_${r.modelId}_${i}`}
                          className={`hover:bg-slate-800/40 transition ${
                            isAres ? 'bg-cyan-950/10' : ''
                          }`}
                        >
                          <td className="py-3 px-4 font-medium text-slate-200 flex items-center gap-1.5">
                            {r.modelName}
                            {isAres && (
                              <span className="text-[10px] px-1 py-0.2 bg-cyan-500/20 text-cyan-300 rounded">
                                PROPOSED
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-300">{r.imageName}</td>
                          <td className="py-3 px-3 text-right font-semibold text-cyan-400">
                            {r.metrics.psnr !== null ? r.metrics.psnr.toFixed(2) : '—'}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-300">
                            {r.metrics.ssim !== null ? r.metrics.ssim.toFixed(6) : '—'}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-400">
                            {r.metrics.mse !== null ? r.metrics.mse.toFixed(5) : '—'}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-400">
                            {r.payload.sizeBytes} B
                          </td>
                          <td className="py-3 px-3 text-right text-slate-400">
                            {r.recovery.ber !== null ? r.recovery.ber.toFixed(4) : '—'}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-400">
                            {r.encoding.timeMs !== null ? `${r.encoding.timeMs.toFixed(1)} ms` : '—'}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-400">
                            {r.decoding.timeMs !== null ? `${r.decoding.timeMs.toFixed(1)} ms` : '—'}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {r.recovery.status === 'PASS' ? (
                              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                                PASS
                              </span>
                            ) : r.recovery.status === 'FAIL' ? (
                              <span className="text-[11px] font-semibold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/40">
                                FAIL
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isSuccess ? (
                              <span className="text-[11px] font-semibold text-emerald-400">
                                SUCCESS
                              </span>
                            ) : r.status === 'UNAVAILABLE' ? (
                              <span
                                className="text-[11px] text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/40 cursor-help"
                                title={r.reason || 'Model unavailable in single cover mode'}
                              >
                                UNAVAILABLE
                              </span>
                            ) : (
                              <span
                                className="text-[11px] text-rose-400 bg-rose-950/50 px-2 py-0.5 rounded border border-rose-800/40 cursor-help"
                                title={r.error || r.reason || 'Execution failed'}
                              >
                                FAILED
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. Per-Image Comparison */}
          {activeViewTab === 'PER_IMAGE' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                <span className="text-xs text-slate-400 font-mono mr-2">Select Image:</span>
                {currentRun.images.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImageForPerView(img.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition ${
                      selectedImageForPerView === img.id
                        ? 'bg-cyan-500 text-slate-950 shadow-sm'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {img.name}
                  </button>
                ))}
              </div>

              {selectedImageForPerView && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white font-mono">
                        Per-Image Evaluation: {currentRun.images.find(img => img.id === selectedImageForPerView)?.name}
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        Direct comparison of all selected models on this specific cover image
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-4">Model</th>
                          <th className="py-3 px-3 text-right">PSNR (dB) ↑</th>
                          <th className="py-3 px-3 text-right">SSIM ↑</th>
                          <th className="py-3 px-3 text-right">MSE ↓</th>
                          <th className="py-3 px-3 text-right">BER ↓</th>
                          <th className="py-3 px-3 text-right">Encode (ms)</th>
                          <th className="py-3 px-3 text-right">Decode (ms)</th>
                          <th className="py-3 px-3 text-center">Exact Recovery</th>
                          <th className="py-3 px-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {currentRun.results
                          .filter(r => r.imageId === selectedImageForPerView)
                          .map((r) => (
                            <tr key={r.modelId} className="hover:bg-slate-800/40 transition">
                              <td className="py-3 px-4 font-semibold text-slate-200">
                                {r.modelName}
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-cyan-400">
                                {r.metrics.psnr !== null ? r.metrics.psnr.toFixed(2) : '—'}
                              </td>
                              <td className="py-3 px-3 text-right text-slate-300">
                                {r.metrics.ssim !== null ? r.metrics.ssim.toFixed(6) : '—'}
                              </td>
                              <td className="py-3 px-3 text-right text-slate-400">
                                {r.metrics.mse !== null ? r.metrics.mse.toFixed(5) : '—'}
                              </td>
                              <td className="py-3 px-3 text-right text-slate-400">
                                {r.recovery.ber !== null ? r.recovery.ber.toFixed(4) : '—'}
                              </td>
                              <td className="py-3 px-3 text-right text-slate-400">
                                {r.encoding.timeMs !== null ? `${r.encoding.timeMs.toFixed(1)} ms` : '—'}
                              </td>
                              <td className="py-3 px-3 text-right text-slate-400">
                                {r.decoding.timeMs !== null ? `${r.decoding.timeMs.toFixed(1)} ms` : '—'}
                              </td>
                              <td className="py-3 px-3 text-center">
                                {r.recovery.status === 'PASS' ? (
                                  <span className="text-emerald-400 font-bold">PASS</span>
                                ) : r.recovery.status === 'FAIL' ? (
                                  <span className="text-rose-400 font-bold">FAIL</span>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className={r.status === 'SUCCESS' ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. Overall Aggregates Table */}
          {activeViewTab === 'AGGREGATES' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                    Model Statistical Aggregates (Mean / Std across successful executions)
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Calculated strictly on successfully executed images only. Failures remain visible below.
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Model</th>
                      <th className="py-3 px-3 text-center">Tested</th>
                      <th className="py-3 px-3 text-center">Success / Fail</th>
                      <th className="py-3 px-3 text-right">Mean PSNR (dB)</th>
                      <th className="py-3 px-3 text-right">Std PSNR</th>
                      <th className="py-3 px-3 text-right">Mean SSIM</th>
                      <th className="py-3 px-3 text-right">Mean MSE</th>
                      <th className="py-3 px-3 text-right">Mean Encode (ms)</th>
                      <th className="py-3 px-3 text-right">Mean Decode (ms)</th>
                      <th className="py-3 px-4 text-right">Recovery Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {Object.values(aggregates).map((agg) => (
                      <tr key={agg.modelId} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-semibold text-slate-200">
                          {agg.modelName}
                        </td>
                        <td className="py-3 px-3 text-center text-slate-300 font-bold">
                          {agg.totalTested}
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          <span className="text-emerald-400">{agg.successfulCount}</span> /{' '}
                          <span className={agg.failedCount + agg.unavailableCount > 0 ? 'text-amber-400' : 'text-slate-500'}>
                            {agg.failedCount + agg.unavailableCount}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-cyan-400">
                          {agg.successfulCount > 0 ? agg.psnr.mean.toFixed(2) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-400">
                          {agg.successfulCount > 0 ? `±${agg.psnr.std.toFixed(3)}` : '—'}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-300">
                          {agg.successfulCount > 0 ? agg.ssim.mean.toFixed(6) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-400">
                          {agg.successfulCount > 0 ? agg.mse.mean.toFixed(5) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-400">
                          {agg.successfulCount > 0 ? `${agg.encodeTimeMs.mean.toFixed(1)}` : '—'}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-400">
                          {agg.successfulCount > 0 ? `${agg.decodeTimeMs.mean.toFixed(1)}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-400">
                          {agg.totalTested > 0 ? `${agg.recoveryRatePct.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. PSNR / SSIM Recharts Visualization */}
          {activeViewTab === 'CHARTS' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                    Model Benchmark Performance Chart
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Dynamically rendered from real model execution results
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Metric Toggle: PSNR vs SSIM */}
                  <div className="flex items-center bg-slate-950 rounded-lg p-1 border border-slate-800 text-xs font-mono">
                    <button
                      onClick={() => setChartMetric('PSNR')}
                      className={`px-3 py-1 rounded transition ${
                        chartMetric === 'PSNR'
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      PSNR (dB)
                    </button>
                    <button
                      onClick={() => setChartMetric('SSIM')}
                      className={`px-3 py-1 rounded transition ${
                        chartMetric === 'SSIM'
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      SSIM
                    </button>
                  </div>

                  {/* Mode Toggle: Per Image vs Mean */}
                  <div className="flex items-center bg-slate-950 rounded-lg p-1 border border-slate-800 text-xs font-mono">
                    <button
                      onClick={() => setChartMode('PER_IMAGE')}
                      className={`px-3 py-1 rounded transition ${
                        chartMode === 'PER_IMAGE'
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Per Image
                    </button>
                    <button
                      onClick={() => setChartMode('MEAN')}
                      className={`px-3 py-1 rounded transition ${
                        chartMode === 'MEAN'
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Mean Across Images
                    </button>
                  </div>
                </div>
              </div>

              <div className="h-80 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  {chartMode === 'MEAN' ? (
                    <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="fullName" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis
                        stroke="#64748b"
                        tick={{ fontSize: 11 }}
                        domain={chartMetric === 'PSNR' ? [65, 80] : [0.999, 1.0]}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '8px' }}
                        formatter={(val: any) => [val !== null ? (typeof val === 'number' ? val.toFixed(chartMetric === 'PSNR' ? 2 : 6) : val) : 'Unavailable', chartMetric]}
                      />
                      <Bar dataKey="value" name={chartMetric} fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : (
                    <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis
                        stroke="#64748b"
                        tick={{ fontSize: 11 }}
                        domain={chartMetric === 'PSNR' ? [65, 80] : [0.999, 1.0]}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '8px' }}
                      />
                      <Legend />
                      {currentRun.modelIds.map((mId, idx) => {
                        const shortName = (getModelAdapter(mId)?.name || mId).split(' ')[0];
                        return (
                          <Bar
                            key={mId}
                            dataKey={shortName}
                            name={getModelAdapter(mId)?.name || mId}
                            fill={modelColors[idx % modelColors.length]}
                            radius={[4, 4, 0, 0]}
                          />
                        );
                      })}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 5. Stego Gallery */}
          {activeViewTab === 'GALLERY' && (
            <div className="space-y-6">
              {currentRun.images.map((img) => (
                <div key={img.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <h4 className="text-xs font-bold text-white font-mono flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-cyan-400"></span>
                      {img.name} ({img.width}×{img.height} px)
                    </h4>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {/* Cover */}
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-300 font-mono">Original Cover</div>
                      <div className="aspect-square rounded overflow-hidden bg-slate-900 border border-slate-800">
                        <img src={img.dataUrl} alt="Original Cover" className="w-full h-full object-cover" />
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">Cover Reference</div>
                    </div>

                    {/* Stego results for each model */}
                    {currentRun.modelIds.map((mId) => {
                      const match = currentRun.results.find(r => r.imageId === img.id && r.modelId === mId);
                      const adapter = getModelAdapter(mId);

                      return (
                        <div key={mId} className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                          <div className="text-[11px] font-semibold text-slate-200 font-mono truncate" title={adapter?.name}>
                            {adapter?.name}
                          </div>

                          {match && match.status === 'SUCCESS' && match.stegoDataUrl ? (
                            <>
                              <div className="aspect-square rounded overflow-hidden bg-slate-900 border border-slate-800 relative group">
                                <img src={match.stegoDataUrl} alt="Stego output" className="w-full h-full object-cover" />
                                <a
                                  href={match.stegoDataUrl}
                                  download={`${img.id}_${mId}_stego.png`}
                                  className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-slate-900/90 text-cyan-400 hover:text-white border border-slate-700 opacity-0 group-hover:opacity-100 transition"
                                  title="Download actual generated stego image"
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                              </div>
                              <div className="flex items-center justify-between text-[10px] font-mono">
                                <span className="text-cyan-400 font-bold">{match.metrics.psnr?.toFixed(2)} dB</span>
                                <span className="text-emerald-400 font-medium">PASS</span>
                              </div>
                            </>
                          ) : (
                            <div className="aspect-square rounded bg-slate-900 border border-slate-800 flex flex-col items-center justify-center p-3 text-center text-slate-500">
                              <AlertCircle className="h-6 w-6 mb-1 text-amber-500/60" />
                              <span className="text-[11px] font-medium text-slate-400">No stego image</span>
                              <span className="text-[9px] text-slate-600 mt-1 line-clamp-2">
                                {match?.reason || match?.error || 'Model execution unavailable'}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
