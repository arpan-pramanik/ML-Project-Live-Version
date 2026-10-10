"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";

const CryptoChart = dynamic(
  () => import("../components/CryptoChart").then(mod => mod.CryptoChart),
  { ssr: false }
);

interface HardwareInfo {
  cpu: {
    model: string;
    threads: number;
    ram_total_mb: number;
    ram_used_mb: number;
    ram_util_pct: number;
  };
  gpu: {
    model: string;
    cuda_available: boolean;
    vram_total_mb: number;
    vram_used_mb: number;
    vram_util_pct: number;
    gpu_util_pct: number;
    device_ordinal: number;
  };
}

interface TrajectoryPoint {
  sample: number;
  cumulative_acc: number;
  window_acc: number;
  f1: number;
  drift: number;
}

interface ComponentMod {
  sample_index: number;
  event: string;
  components_affected: number;
  adaptation_latency_ms: number;
  device: string;
}

interface FeatureRank {
  rank: number;
  feature_identifier?: string;
  feature_name: string;
  feature_index: number;
  active: boolean;
}

interface LogEntry {
  timestamp: string;
  message: string;
  level: string;
  details?: Record<string, unknown>;
}

interface GraphNode {
  id: number;
  label: string;
  is_active: boolean;
  samples: number;
  accuracy: number;
  variance_scale: number;
  created_at: number;
  last_active_step: number;
}

interface GraphEdge {
  from: number;
  to: number;
  weight: number;
  probability: number;
  is_active_transition: boolean;
}

interface GraphMemoryState {
  active_node_id: number | null;
  total_nodes: number;
  recall_count: number;
  spawn_count: number;
  total_queries: number;
  last_action: string;
  last_distance: number;
  similarity_threshold: number;
  next_predicted_regime: number | null;
  next_predicted_probability: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface PortfolioState {
  capital: number;
  pnl: number;
  pnl_pct: number;
  position: number;
  trades: number;
  win_rate: number;
  max_drawdown: number;
  risk_status?: string;
}

interface DownstreamAction {
  timestamp: string;
  price: number;
  signal: string;
  confidence: number;
  risk_action: string;
  drift: boolean;
  graph_action: string;
  adaptive_pnl: number;
  static_pnl: number;
}

interface DownstreamState {
  adaptive: PortfolioState;
  static: PortfolioState;
  retrain: PortfolioState;
  recent_actions: DownstreamAction[];
}

interface LiveStreamStatus {
  source: string;
  product_id: string;
  connected: boolean;
  running: boolean;
  latest_price: number;
  latest_volume: number;
  total_ticks: number;
  tick_rate: number;
  elapsed_seconds: number;
}

interface PricePoint {
  price: number;
  timestamp: number;
  time_str: string;
}

interface FutureStep {
  step: number;
  price: number;
  delta: number;
  delta_pct: number;
}

interface PriceStreamData {
  product_id: string;
  current_price: number;
  direction: "UP" | "DOWN";
  confidence: number;
  target_price: number;
  target_delta: number;
  target_delta_pct: number;
  recent_prices: PricePoint[];
  predicted_future: FutureStep[];
  volatility: number;
  timestamp: number;
}

export interface PredictionMatch {
  id: number;
  time: string;
  entry_price: number;
  predicted_dir: "UP" | "DOWN";
  target_price: number;
  actual_price: number;
  actual_dir: "UP" | "DOWN";
  status: "HIT" | "MISS";
  proximity_pct: number;
  confidence: number;
  price_diff: number;
}

export interface PredictionVerificationData {
  total_verified: number;
  correct_matches: number;
  match_rate_pct: number;
  avg_proximity_pct: number;
  pending_count: number;
  recent_matches: PredictionMatch[];
}

interface TelemetrySnapshot {
  running: boolean;
  dataset_name: string;
  model_name: string;
  detector_name: string;
  stage: string;
  device: string;
  current_sample: number;
  total_samples: number;
  accuracy: number;
  window_accuracy: number;
  f1_score: number;
  drift_count: number;
  adaptation_count: number;
  components_modified: number;
  adaptation_time_ms: number;
  throughput: number;
  logs: LogEntry[];
  trajectory: TrajectoryPoint[];
  feature_rankings: FeatureRank[];
  component_modifications: ComponentMod[];
  graph_memory?: GraphMemoryState;
  downstream?: DownstreamState;
  live_stream_status?: LiveStreamStatus;
  price_stream?: PriceStreamData;
  prediction_verification?: PredictionVerificationData;
}

export default function ControlPanel() {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [datasets, setDatasets] = useState<Array<{ id: string; name: string; type: string }>>([
    { id: "coinbase_btc", name: "Coinbase BTC/USD Live Feed", type: "Real-Time Exchange Data" },
    { id: "coinbase_eth", name: "Coinbase ETH/USD Live Feed", type: "Real-Time Exchange Data" },
    { id: "electricity", name: "NSW Electricity Market", type: "Real Recurring Concept" },
    { id: "covertype", name: "Forest Covertype", type: "Real Multi-Class Shift" },
    { id: "airlines", name: "Airlines Flight Delay", type: "Real Distribution Drift" },
  ]);

  const [selectedDataset, setSelectedDataset] = useState("coinbase_btc");
  const [selectedModel, setSelectedModel] = useState("graph_memory_adaptive");
  const [selectedDetector, setSelectedDetector] = useState("adwin");
  const [warmup, setWarmup] = useState(20);
  const [windowSize, setWindowSize] = useState(50);

  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [showLogsDrawer, setShowLogsDrawer] = useState(false);
  const [activeTab, setActiveTab] = useState<"crypto" | "trajectory">("crypto");
  const [exportNotice, setExportNotice] = useState("");
  const logConsoleRef = useRef<HTMLDivElement>(null);

  // Poll hardware stats
  const fetchHardware = async () => {
    try {
      const res = await fetch("/api/hardware");
      if (res.ok) {
        const data = await res.json();
        setHardware(data);
      }
    } catch {
      // quiet fallback
    }
  };

  // Poll telemetry
  const fetchTelemetry = async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data: TelemetrySnapshot = await res.json();
        setTelemetry(data);
      }
    } catch {
      // quiet fallback
    }
  };

  // Fetch datasets list
  const fetchDatasets = async () => {
    try {
      const res = await fetch("/api/datasets");
      if (res.ok) {
        const data = await res.json();
        if (data.datasets) setDatasets(data.datasets);
      }
    } catch {
      // quiet fallback
    }
  };

  useEffect(() => {
    fetchHardware();
    fetchTelemetry();
    fetchDatasets();

    const hwInterval = setInterval(fetchHardware, 4000);
    const telInterval = setInterval(fetchTelemetry, 600);

    return () => {
      clearInterval(hwInterval);
      clearInterval(telInterval);
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logConsoleRef.current) {
      logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
    }
  }, [telemetry?.logs]);

  const handleStart = async () => {
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset: selectedDataset,
          model: selectedModel,
          detector: selectedDetector,
          warmup: warmup,
          window: windowSize,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert("Execution Error: " + (err.message || "Failed to start pipeline"));
      } else {
        setShowConfigDrawer(false);
      }
    } catch {
      alert("Network Error: Could not connect to ML backend.");
    }
  };

  const handleStop = async () => {
    try {
      await fetch("/api/stop", { method: "POST" });
    } catch (err) {
      console.error(err);
    }
  };

  const triggerExport = async (format: string) => {
    try {
      const res = await fetch(`/api/export?format=${format}`);
      if (res.ok) {
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition");
        let filename = `export_${format}_${Date.now()}`;
        if (disposition && disposition.includes("filename=")) {
          filename = disposition.split("filename=")[1].replace(/"/g, "").trim();
        } else {
          filename += format === "json" ? ".json" : ".csv";
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        setExportNotice(`Exported ${filename}`);
        setTimeout(() => setExportNotice(""), 4000);
      }
    } catch {
      // quiet error
    }
  };

  // Trajectory SVG calculations
  const trajectory = telemetry?.trajectory || [];
  const totalSamples = telemetry?.total_samples || 1;
  const maxSample = Math.max(totalSamples, trajectory[trajectory.length - 1]?.sample || 1);
  const trajSvgWidth = 800;
  const trajSvgHeight = 170;
  const trajPadX = 45;
  const trajPadTop = 15;
  const trajPadBottom = 22;
  const trajPlotW = Math.max(10, trajSvgWidth - trajPadX - 15);
  const trajPlotH = trajSvgHeight - trajPadTop - trajPadBottom;

  const getTrajX = (s: number) => trajPadX + (s / maxSample) * trajPlotW;
  const getTrajY = (acc: number) => trajPadTop + trajPlotH - (acc / 100) * trajPlotH;

  let dCum = "";
  let dWin = "";
  const driftLines: number[] = [];

  trajectory.forEach((pt, i) => {
    const x = getTrajX(pt.sample);
    const yC = getTrajY(pt.cumulative_acc);
    const yW = getTrajY(pt.window_acc);

    if (i === 0) {
      dCum += `M ${x} ${yC}`;
      dWin += `M ${x} ${yW}`;
    } else {
      dCum += ` L ${x} ${yC}`;
      dWin += ` L ${x} ${yW}`;
    }

    if (pt.drift === 1) {
      driftLines.push(x);
    }
  });

  // Price Stream & Future Trajectory Calculations
  const priceStream = telemetry?.price_stream;
  // Ignore past trades for this specific SVG chart; we only want to map the future prediction horizon.
  const recentPrices: any[] = [];
  const futureSteps = priceStream?.predicted_future || [];
  const currentPrice = priceStream?.current_price || (telemetry?.live_stream_status?.latest_price || 0);

  const priceSvgWidth = 800;
  const priceSvgHeight = 220;
  const pPadLeft = 65;
  const pPadRight = 80;
  const pPadTop = 20;
  const pPadBottom = 28;
  const pPlotW = priceSvgWidth - pPadLeft - pPadRight;
  const pPlotH = priceSvgHeight - pPadTop - pPadBottom;

  // Compute Price Y domain
  const pastPriceVals = recentPrices.map((p) => p.price);
  const futurePriceVals = futureSteps.map((f) => f.price);
  const allPriceVals = [...pastPriceVals, currentPrice, ...futurePriceVals].filter((p) => p > 0);
  const minPrice = allPriceVals.length > 0 ? Math.min(...allPriceVals) * 0.9995 : 0;
  const maxPrice = allPriceVals.length > 0 ? Math.max(...allPriceVals) * 1.0005 : 100;
  const priceRange = Math.max(0.1, maxPrice - minPrice);

  const getPriceY = (val: number) => pPadTop + pPlotH - ((val - minPrice) / priceRange) * pPlotH;

  // Compute X coordinates
  const pastCount = Math.max(1, recentPrices.length);
  const futureCount = futureSteps.length;
  const totalSteps = pastCount + futureCount;

  const getPastX = (idx: number) => pPadLeft + (idx / Math.max(1, totalSteps - 1)) * pPlotW;
  const getFutureX = (stepIdx: number) => pPadLeft + ((pastCount - 1 + stepIdx + 1) / Math.max(1, totalSteps - 1)) * pPlotW;

  let dPastPrice = "";
  recentPrices.forEach((pt, i) => {
    const x = getPastX(i);
    const y = getPriceY(pt.price);
    if (i === 0) dPastPrice += `M ${x} ${y}`;
    else dPastPrice += ` L ${x} ${y}`;
  });

  const boundaryX = getPastX(pastCount - 1);
  const boundaryY = getPriceY(currentPrice || (recentPrices[recentPrices.length - 1]?.price || 0));

  let dFuturePrice = "";
  if (futureSteps.length > 0) {
    dFuturePrice = `M ${boundaryX} ${boundaryY}`;
    futureSteps.forEach((fs, i) => {
      const x = getFutureX(i);
      const y = getPriceY(fs.price);
      dFuturePrice += ` L ${x} ${y}`;
    });
  }

  const isLiveStream = selectedDataset.startsWith("coinbase") || Boolean(telemetry?.live_stream_status?.running);
  const adaptiveCapital = telemetry?.downstream?.adaptive?.capital || 10000;
  const staticCapital = telemetry?.downstream?.static?.capital || 10000;
  const retrainCapital = telemetry?.downstream?.retrain?.capital || 10000;
  const adaptivePnl = telemetry?.downstream?.adaptive?.pnl || 0;
  const staticPnl = telemetry?.downstream?.static?.pnl || 0;
  const alphaEdge = adaptivePnl - staticPnl;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-6 flex flex-col gap-4">
      {/* 1. Header & Navigation Bar */}
      <header className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-base">
            AT
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-slate-900">
                ATREUS STREAMING PLATFORM
              </h1>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                v2026.4
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Online Machine Learning & Adaptive Concept Drift Architecture
            </p>
          </div>
        </div>

        {/* Status & Control Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">
              {hardware?.cpu ? `${hardware.cpu.threads} CPU Threads` : "CPU Active"}
            </span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-blue-700">
              {hardware?.gpu?.cuda_available ? `${hardware.gpu.model} (CUDA)` : "Standard Host Mode"}
            </span>
          </div>

          {!telemetry?.running ? (
            <button
              type="button"
              onClick={handleStart}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs tracking-wide cursor-pointer shadow-sm transition"
            >
              Start Stream
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs tracking-wide cursor-pointer shadow-sm transition"
            >
              Halt Stream
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowConfigDrawer(!showConfigDrawer)}
            className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 cursor-pointer transition"
          >
            Configure
          </button>

          <button
            type="button"
            onClick={() => triggerExport("json")}
            className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 cursor-pointer transition"
          >
            Export
          </button>
        </div>
      </header>

      {/* 2. Active Stream Information Ribbon */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm">
              LIVE
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  DATA SOURCE:
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                  {isLiveStream ? "LIVE WEBSOCKET FEED" : "BENCHMARK STREAM"}
                </span>
                <span className="text-xs text-slate-800 font-semibold">
                  {datasets.find((d) => d.id === selectedDataset)?.name || selectedDataset}
                </span>
              </div>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-2xl font-bold text-slate-900 font-mono">
                  {isLiveStream && currentPrice
                    ? `$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `Sample #${(telemetry?.current_sample || 0).toLocaleString()}`}
                </span>
                {isLiveStream && (
                  <span className="text-xs text-slate-500 font-medium">
                    Velocity:{" "}
                    <strong className="text-blue-700 font-mono font-semibold">
                      {telemetry?.live_stream_status?.tick_rate || 0} ticks/sec
                    </strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Clean Text Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-right">
              <div className="text-[10px] font-semibold text-slate-500 uppercase">
                CONCEPT REGIME STATE
              </div>
              <div className="text-xs font-bold text-blue-700">
                {telemetry?.graph_memory?.nodes?.find((n) => n.is_active)?.label || "Regime #0: Stationary"}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-right">
              <div className="text-[10px] font-semibold text-slate-500 uppercase">
                DRIFT STATUS
              </div>
              <div className="text-xs font-bold">
                {telemetry?.stage === "DRIFT_ADAPTING" ? (
                  <span className="text-rose-600">[DRIFT DETECTED]</span>
                ) : (
                  <span className="text-emerald-700">[EQUILIBRIUM]</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Configuration Drawer (2 Columns Only) */}
      {showConfigDrawer && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-center border-b border-slate-200 pb-3 mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Stream & Architecture Configuration
            </h2>
            <button
              type="button"
              onClick={() => setShowConfigDrawer(false)}
              className="text-xs text-slate-500 hover:text-slate-800 px-2 py-0.5 rounded hover:bg-slate-100"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Target Data Stream
              </label>
              <select
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                value={selectedDataset}
                onChange={(e) => setSelectedDataset(e.target.value)}
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} [{d.type}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                ML Model Architecture
              </label>
              <select
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                <option value="graph_memory_adaptive">
                  Graph Memory Concept Topology Adaptive Model (0ms Recall)
                </option>
                <option value="drift_moe">
                  DriftMoE (2026 Mixture of Experts + CUDA)
                </option>
                <option value="proposed">
                  Proposed Selective Adapt (RF + SVM + Online Scaler)
                </option>
                <option value="boosted_forest">
                  Boosted ARF-DWM Forest (Shadow Trees)
                </option>
                <option value="full_retrain">Full Retraining (Baseline)</option>
                <option value="static">Static Streaming Model (No Adapt)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Online Drift Detector
              </label>
              <select
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                value={selectedDetector}
                onChange={(e) => setSelectedDetector(e.target.value)}
              >
                <option value="adwin">ADWIN (Adaptive Sliding Window)</option>
                <option value="ddm">DDM (Drift Detection Method)</option>
                <option value="eddm">EDDM (Early Drift Detection Method)</option>
                <option value="page_hinkley">Page-Hinkley Cumulative Sum</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Rolling Evaluation Window (Samples)
              </label>
              <input
                type="number"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900"
                value={windowSize}
                onChange={(e) => setWindowSize(parseInt(e.target.value) || 50)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={handleStart}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wide cursor-pointer shadow-sm transition"
            >
              Apply & Run Pipeline
            </button>
          </div>
        </section>
      )}

      {/* 4. Core Performance Metrics Grid (4 Columns) */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
            PREQUENTIAL ACCURACY
          </div>
          <div className="text-2xl font-bold text-blue-700 mt-1 font-mono">
            {(telemetry?.accuracy || 0).toFixed(2)}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Cumulative Stream Evaluation
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
            WINDOWED ACCURACY
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {(telemetry?.window_accuracy || 0).toFixed(2)}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Last {windowSize} Rolling Samples
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
            DRIFT SIGNALS
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {telemetry?.drift_count || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {telemetry?.adaptation_count || 0} Selective Adaptations
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
            ADAPTATION LATENCY
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {(telemetry?.adaptation_time_ms || 0).toFixed(2)} ms
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Throughput: {telemetry?.throughput || 0} samples/sec
          </div>
        </div>
      </section>

      {/* 5. Live Crypto Price Chart with Future Predicted Trajectory */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-slate-200 pb-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                LIVE MARKET STREAM & FORWARD PREDICTION TRAJECTORY
              </h2>
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                REAL-TIME INFERENCE
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Dashed amber line exclusively displays the model&apos;s forward predicted price path (T+1 to T+8).
            </p>
          </div>

          {/* Visual Legend */}
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-amber-600 font-semibold">
              <span className="w-3.5 h-0.5 bg-amber-500" /> Model Forecast (Future)
            </span>
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-3 h-0.5 border-t border-dashed border-slate-400" /> Now (T₀)
            </span>
          </div>
        </div>

        {/* SVG Live Crypto Chart */}
        <div className="w-full h-56 relative bg-slate-50 rounded-lg overflow-hidden border border-slate-200">
          <svg width="100%" height="224" viewBox={`0 0 ${priceSvgWidth} ${priceSvgHeight}`} preserveAspectRatio="none">
            {/* Grid Horizontal Lines */}
            <line x1={pPadLeft} y1={pPadTop} x2={priceSvgWidth - pPadRight} y2={pPadTop} stroke="#e2e8f0" strokeWidth="1" />
            <text x={8} y={pPadTop + 4} fontSize="9" fill="#64748b" fontFamily="monospace">
              ${maxPrice.toFixed(2)}
            </text>

            <line x1={pPadLeft} y1={pPadTop + pPlotH / 2} x2={priceSvgWidth - pPadRight} y2={pPadTop + pPlotH / 2} stroke="#e2e8f0" strokeWidth="1" />
            <text x={8} y={pPadTop + pPlotH / 2 + 4} fontSize="9" fill="#64748b" fontFamily="monospace">
              ${((maxPrice + minPrice) / 2).toFixed(2)}
            </text>

            <line x1={pPadLeft} y1={pPadTop + pPlotH} x2={priceSvgWidth - pPadRight} y2={pPadTop + pPlotH} stroke="#e2e8f0" strokeWidth="1" />
            <text x={8} y={pPadTop + pPlotH + 4} fontSize="9" fill="#64748b" fontFamily="monospace">
              ${minPrice.toFixed(2)}
            </text>

            {/* Vertical Boundary Line at NOW */}
            <line
              x1={boundaryX}
              y1={pPadTop}
              x2={boundaryX}
              y2={priceSvgHeight - pPadBottom}
              stroke="#94a3b8"
              strokeWidth="1.5"
              strokeDasharray="4,3"
            />
            <text x={boundaryX + 10} y={priceSvgHeight - 10} fontSize="10" fill="#475569" fontWeight="bold" fontFamily="monospace">
              NOW (SPOT PRICE)
            </text>
            <text x={boundaryX + 150} y={priceSvgHeight - 10} fontSize="9" fill="#d97706" fontWeight="bold" fontFamily="monospace">
              PREDICTED HORIZON (T+1 .. T+8) →
            </text>

            {/* Historical Real-Time Price Line (Solid Blue) */}
            {dPastPrice && (
              <path
                d={dPastPrice}
                fill="none"
                stroke="#1d4ed8"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Predicted Future Path (Dashed Amber) */}
            {dFuturePrice && (
              <path
                d={dFuturePrice}
                fill="none"
                stroke="#d97706"
                strokeWidth="2.5"
                strokeDasharray="5,4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Past Ticks Marker at Current Price */}
            {currentPrice > 0 && (
              <circle
                cx={boundaryX}
                cy={boundaryY}
                r="4.5"
                fill="#1d4ed8"
                stroke="#ffffff"
                strokeWidth="2"
              />
            )}

            {/* Future Step Point Markers */}
            {futureSteps.map((fs, idx) => {
              const fx = getFutureX(idx);
              const fy = getPriceY(fs.price);
              return (
                <g key={idx}>
                  <circle
                    cx={fx}
                    cy={fy}
                    r="3.5"
                    fill="#d97706"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                  {idx === futureSteps.length - 1 && (
                    <g>
                      <rect
                        x={fx + 6}
                        y={fy - 12}
                        width="68"
                        height="20"
                        rx="4"
                        fill="#ffffff"
                        stroke="#d97706"
                        strokeWidth="1"
                      />
                      <text
                        x={fx + 10}
                        y={fy + 2}
                        fontSize="9"
                        fill="#b45309"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        ${fs.price.toFixed(2)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* 4 Forecast KPI Tiles (4 Columns) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] font-semibold text-slate-500 uppercase">SPOT PRICE</div>
            <div className="text-lg font-bold text-blue-700 mt-0.5 font-mono">
              ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-500">Live Trade Price</div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] font-semibold text-slate-500 uppercase">FORECAST TARGET (T+8)</div>
            <div className="text-lg font-bold text-amber-700 mt-0.5 font-mono">
              ${(priceStream?.target_price || currentPrice).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="text-[10px] font-semibold text-amber-700 font-mono">
              {(priceStream?.target_delta || 0) >= 0 ? "+" : ""}
              {(priceStream?.target_delta || 0).toFixed(2)} (
              {(priceStream?.target_delta_pct || 0) >= 0 ? "+" : ""}
              {(priceStream?.target_delta_pct || 0).toFixed(3)}%)
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] font-semibold text-slate-500 uppercase">MODEL SIGNAL & CONFIDENCE</div>
            <div className="text-base font-bold text-slate-900 mt-0.5">
              {priceStream?.direction === "UP" ? (
                <span className="text-blue-700">▲ UPWARD TREND</span>
              ) : (
                <span className="text-rose-600">▼ DOWNWARD TREND</span>
              )}
            </div>
            <div className="text-[10px] text-slate-600 font-mono">
              Confidence: {priceStream?.confidence || 50}%
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] font-semibold text-slate-500 uppercase">STREAM VOLATILITY</div>
            <div className="text-lg font-bold text-slate-800 mt-0.5 font-mono">
              {priceStream?.volatility || 0.3}‰
            </div>
            <div className="text-[10px] text-slate-500">Rolling Variance Scale</div>
          </div>
        </div>
      </section>

      {/* 5.5 Advanced Interactive Financial Chart (TradingView) */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-slate-200 pb-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                ADVANCED INTERACTIVE CHART (TRADINGVIEW)
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Fully interactive financial stock graph featuring panning, zooming, crosshairs, and price scales. 
              Plots the deep historical streaming price paired with the AI-driven predicted horizon (T+1 .. T+8).
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-blue-700 font-semibold">
              <span className="w-3 h-0.5 bg-blue-700"></span> Live Spot Price
            </span>
            <span className="flex items-center gap-1.5 text-amber-700 font-semibold">
              <span className="w-3 h-0.5 border-t border-dashed border-amber-600"></span> Predicted Price (T+8)
            </span>
          </div>
        </div>

        <div className="w-full">
          <CryptoChart 
            prices={priceStream?.recent_prices || []} 
            predictions={priceStream?.predicted_future || []} 
          />
        </div>
      </section>

      {/* 5.6 Real-Time Prediction Horizon Verification (Predict -> Wait -> Match) */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-slate-200 pb-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                PREDICTION HORIZON VERIFICATION (PREDICT → WAIT → MATCH)
              </h2>
              <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded">
                TRUTH AUDIT
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Every forecast is queued, held for 5 market ticks, and rigorously matched against real trade execution. 
              Eliminates hallucinations by verifying actual directional accuracy and target price closeness.
            </p>
          </div>
          <div className="text-xs font-mono font-medium text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            Active Pending Horizons: <span className="font-bold text-blue-700">{telemetry?.prediction_verification?.pending_count || 0}</span>
          </div>
        </div>

        {/* 4 Summary Metric Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] font-semibold text-slate-500 uppercase">HORIZON MATCH RATE</div>
            <div className="text-xl font-bold text-blue-700 mt-0.5 font-mono">
              {(telemetry?.prediction_verification?.match_rate_pct || 0).toFixed(1)}%
            </div>
            <div className="text-[10px] text-slate-500">Directional Accuracy</div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] font-semibold text-slate-500 uppercase">TARGET PROXIMITY</div>
            <div className="text-xl font-bold text-slate-900 mt-0.5 font-mono">
              {(telemetry?.prediction_verification?.avg_proximity_pct || 0).toFixed(1)}%
            </div>
            <div className="text-[10px] text-slate-500">Price Target Closeness</div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] font-semibold text-slate-500 uppercase">VERIFIED PREDICTIONS</div>
            <div className="text-xl font-bold text-slate-900 mt-0.5 font-mono">
              {telemetry?.prediction_verification?.total_verified || 0}
            </div>
            <div className="text-[10px] text-slate-500">
              {telemetry?.prediction_verification?.correct_matches || 0} Hits / {((telemetry?.prediction_verification?.total_verified || 0) - (telemetry?.prediction_verification?.correct_matches || 0))} Misses
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] font-semibold text-slate-500 uppercase">HORIZON DURATION</div>
            <div className="text-xl font-bold text-slate-900 mt-0.5 font-mono">
              5 TICKS
            </div>
            <div className="text-[10px] text-slate-500">Delay-to-Match Window</div>
          </div>
        </div>

        {/* Live Horizon Verification Audit Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex justify-between items-center">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Recent Verified Horizon Executions
            </span>
            <span className="text-[10px] text-slate-500">
              Ordered by resolution timestamp
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-white border-b border-slate-200 text-[10px] text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Entry Price</th>
                  <th className="px-3 py-2">Forecast Target</th>
                  <th className="px-3 py-2">Actual Price</th>
                  <th className="px-3 py-2">Closeness</th>
                  <th className="px-3 py-2 text-right">Match Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {(telemetry?.prediction_verification?.recent_matches && telemetry.prediction_verification.recent_matches.length > 0) ? (
                  telemetry.prediction_verification.recent_matches.slice().reverse().map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-500">{m.time}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">${m.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2">
                        <span className={m.predicted_dir === "UP" ? "text-blue-700 font-semibold" : "text-rose-600 font-semibold"}>
                          {m.predicted_dir === "UP" ? "▲ UP" : "▼ DOWN"} (${m.target_price.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-800">
                        ${m.actual_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        <span className="text-[10px] text-slate-500 ml-1">
                          ({m.price_diff >= 0 ? "+" : ""}${m.price_diff.toFixed(2)})
                        </span>
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-700">
                        {m.proximity_pct.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right">
                        {m.status === "HIT" ? (
                          <span className="inline-block bg-blue-50 text-blue-700 border border-blue-200 font-bold px-2 py-0.5 rounded text-[10px]">
                            HIT
                          </span>
                        ) : (
                          <span className="inline-block bg-slate-100 text-slate-600 border border-slate-200 font-semibold px-2 py-0.5 rounded text-[10px]">
                            MISS
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-slate-400 font-sans text-xs">
                      Awaiting initial 5-tick horizon resolution. Forecasts will match live in real-time...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 6. Benchmark Accuracy & Drift Trajectory Chart */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-slate-200 pb-3 mb-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              ACCURACY EVALUATION & DRIFT MARKER TRAJECTORY
            </h2>
            <p className="text-[11px] text-slate-500">
              Sequential prequential accuracy line over incoming samples with automated drift marker events.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-blue-700 font-semibold">
              <span className="w-3.5 h-0.5 bg-blue-700" /> Cumulative Accuracy
            </span>
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-3.5 h-0.5 border-t border-dashed border-slate-400" /> Windowed Accuracy
            </span>
            <span className="flex items-center gap-1.5 text-rose-600 font-semibold">
              <span className="w-3.5 h-0.5 bg-rose-600" /> Drift Event
            </span>
          </div>
        </div>

        <div className="w-full h-44 relative bg-slate-50 rounded-lg overflow-hidden border border-slate-200">
          <svg width="100%" height="176" viewBox={`0 0 ${trajSvgWidth} ${trajSvgHeight}`} preserveAspectRatio="none">
            {/* Grid Horizontal Lines */}
            <line x1={trajPadX} y1={20} x2={trajSvgWidth} y2={20} stroke="#e2e8f0" strokeWidth="1" />
            <text x="8" y="24" fontSize="9" fill="#64748b" fontFamily="monospace">
              100%
            </text>
            <line x1={trajPadX} y1={55} x2={trajSvgWidth} y2={55} stroke="#e2e8f0" strokeWidth="1" />
            <text x="8" y="59" fontSize="9" fill="#64748b" fontFamily="monospace">
              75%
            </text>
            <line x1={trajPadX} y1={90} x2={trajSvgWidth} y2={90} stroke="#e2e8f0" strokeWidth="1" />
            <text x="8" y="94" fontSize="9" fill="#64748b" fontFamily="monospace">
              50%
            </text>
            <line x1={trajPadX} y1={125} x2={trajSvgWidth} y2={125} stroke="#e2e8f0" strokeWidth="1" />
            <text x="8" y="129" fontSize="9" fill="#64748b" fontFamily="monospace">
              25%
            </text>
            <line x1={trajPadX} y1={145} x2={trajSvgWidth} y2={145} stroke="#cbd5e1" strokeWidth="1" />

            {/* Drift Vertical Event Lines */}
            {driftLines.map((dx, i) => (
              <g key={i}>
                <line
                  x1={dx}
                  y1={trajPadTop}
                  x2={dx}
                  y2={trajSvgHeight - trajPadBottom}
                  stroke="#e11d48"
                  strokeWidth="1.5"
                  strokeDasharray="3,3"
                />
              </g>
            ))}

            {/* Cumulative Accuracy Path (Solid Blue) */}
            {dCum && <path d={dCum} fill="none" stroke="#1d4ed8" strokeWidth="2.5" strokeLinecap="round" />}

            {/* Windowed Accuracy Path (Dashed Slate) */}
            {dWin && (
              <path
                d={dWin}
                fill="none"
                stroke="#64748b"
                strokeWidth="1.5"
                strokeDasharray="4,4"
              />
            )}
          </svg>
        </div>
      </section>

      {/* 7. Concept Topology Graph Memory (Lifelong Continual Learning) */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-slate-200 pb-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                CONCEPT TOPOLOGY GRAPH MEMORY
              </h2>
              <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded">
                LIFELONG LEARNING
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Topological regime network resolving recurring concepts with instant 0ms recall.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold">LAST ACTION:</span>
            <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800 font-mono">
              {telemetry?.graph_memory?.last_action || "INITIALIZED"}
            </span>
          </div>
        </div>

        {/* 4 Summary Metric Cards (4 Columns) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] uppercase font-semibold text-slate-500">DISCOVERED REGIMES</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono">
              {telemetry?.graph_memory?.total_nodes || 1} Nodes
            </div>
            <div className="text-[10px] text-slate-500">Topological States</div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-[10px] uppercase font-semibold text-blue-700">INSTANT RECALLS</div>
            <div className="text-lg font-bold text-blue-800 mt-0.5 font-mono">
              {telemetry?.graph_memory?.recall_count || 0}
            </div>
            <div className="text-[10px] text-blue-600 font-bold">0ms Retraining Time</div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] uppercase font-semibold text-slate-500">ACTIVE REGIME</div>
            <div className="text-sm font-bold text-blue-700 mt-1 truncate">
              Regime #{telemetry?.graph_memory?.active_node_id ?? 0}
            </div>
            <div className="text-[10px] text-slate-500">Online Centroid Distance: {telemetry?.graph_memory?.last_distance || 0.0}</div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] uppercase font-semibold text-slate-500">ANTICIPATED NEXT</div>
            <div className="text-sm font-bold text-slate-900 mt-1 truncate">
              Regime #{telemetry?.graph_memory?.next_predicted_regime ?? 0}
            </div>
            <div className="text-[10px] text-blue-700 font-semibold font-mono">
              {telemetry?.graph_memory?.next_predicted_probability || 0}% Markov Prob
            </div>
          </div>
        </div>

        {/* Dynamic Concept Node Cards Network (4 Columns) */}
        <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 mb-3">
          <div className="text-xs font-semibold text-slate-600 mb-2 flex justify-between items-center">
            <span>DISCOVERED REGIME EXPERTS</span>
            <span className="text-[10px] text-blue-700 font-semibold">
              Highlighted Border = Active Regime
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            {telemetry?.graph_memory?.nodes && telemetry.graph_memory.nodes.length > 0 ? (
              telemetry.graph_memory.nodes.map((node) => (
                <div
                  key={node.id}
                  className={`rounded-lg p-3 border transition ${
                    node.is_active
                      ? "bg-white border-blue-600 border-2"
                      : "bg-white border-slate-200"
                  }`}
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-bold text-slate-900 truncate">{node.label}</span>
                    {node.is_active && (
                      <span className="bg-blue-600 text-white font-bold text-[9px] px-1.5 py-0.5 rounded uppercase">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-500 border-t border-slate-100 pt-1.5 mt-1 font-mono">
                    <span>{node.samples.toLocaleString()} Samples</span>
                    <span className="font-bold text-blue-700">{node.accuracy}% Acc</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-4 text-center py-4 text-slate-500 text-xs">
                Concept topology graph populates automatically as data streams in...
              </div>
            )}
          </div>
        </div>

        {/* Transition Markov Edges Bar */}
        {telemetry?.graph_memory?.edges && telemetry.graph_memory.edges.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto py-1 text-xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 whitespace-nowrap">
              MARKOV TRANSITIONS:
            </span>
            <div className="flex gap-2">
              {telemetry.graph_memory.edges.slice(-6).map((edge, idx) => (
                <span
                  key={idx}
                  className={`px-2.5 py-1 rounded text-[10px] font-mono whitespace-nowrap border ${
                    edge.is_active_transition
                      ? "bg-blue-100 text-blue-800 border-blue-300 font-bold"
                      : "bg-slate-100 text-slate-600 border-slate-200"
                  }`}
                >
                  Regime #{edge.from} → #{edge.to} ({(edge.probability * 100).toFixed(0)}%)
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 8. Downstream Execution & Dynamic Risk Management Cockpit (4 Columns) */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-slate-200 pb-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                DOWNSTREAM EXECUTION & DYNAMIC RISK MANAGEMENT COCKPIT
              </h2>
              <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded">
                CAPITAL BENCHMARK
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Simulated real-time portfolio execution comparing Adaptive vs Static vs Full Retrain.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-600">
            Initial Capital: <strong className="text-slate-900 font-bold">$10,000.00</strong>
          </span>
        </div>

        {/* 4 Cards (4 Columns strictly - NO 3 tiles in a row) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
          {/* Card 1: Adaptive Model */}
          <div className="bg-blue-50/40 border-2 border-blue-600 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-blue-800 uppercase tracking-wide">
                  1. GRAPH ADAPTIVE MODEL
                </span>
                <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                  OUR MODEL
                </span>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xl font-bold text-slate-900 font-mono">
                  ${adaptiveCapital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span
                  className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                    adaptivePnl >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {adaptivePnl >= 0 ? "+" : ""}
                  {adaptivePnl.toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs border-t border-blue-200 pt-2 text-slate-600 font-mono">
                <div>
                  <span className="text-[10px] block text-slate-500">WIN RATE</span>
                  <span className="font-bold text-slate-900">{telemetry?.downstream?.adaptive?.win_rate || 0}%</span>
                </div>
                <div>
                  <span className="text-[10px] block text-slate-500">MAX DD</span>
                  <span className="font-bold text-slate-900">{telemetry?.downstream?.adaptive?.max_drawdown || 0}%</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-blue-200 text-[10px] font-bold text-blue-800 uppercase">
              STATUS: {telemetry?.downstream?.adaptive?.risk_status || "NORMAL (100% Exposure)"}
            </div>
          </div>

          {/* Card 2: Static Baseline Model */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  2. STATIC MODEL
                </span>
                <span className="bg-slate-100 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                  NO ADAPT
                </span>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xl font-bold text-slate-900 font-mono">
                  ${staticCapital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span
                  className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                    staticPnl >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {staticPnl >= 0 ? "+" : ""}
                  {staticPnl.toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-2 text-slate-600 font-mono">
                <div>
                  <span className="text-[10px] block text-slate-500">WIN RATE</span>
                  <span className="font-bold text-slate-900">{telemetry?.downstream?.static?.win_rate || 0}%</span>
                </div>
                <div>
                  <span className="text-[10px] block text-slate-500">MAX DD</span>
                  <span className="font-bold text-slate-900">{telemetry?.downstream?.static?.max_drawdown || 0}%</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] font-bold text-slate-500 uppercase">
              DEFECT: DRAWS DOWN ON DRIFT
            </div>
          </div>

          {/* Card 3: Full Retrain Baseline */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  3. FULL RETRAIN
                </span>
                <span className="bg-slate-100 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                  PERIODIC REFIT
                </span>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xl font-bold text-slate-900 font-mono">
                  ${retrainCapital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span
                  className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                    (telemetry?.downstream?.retrain?.pnl || 0) >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {(telemetry?.downstream?.retrain?.pnl || 0) >= 0 ? "+" : ""}
                  {(telemetry?.downstream?.retrain?.pnl || 0).toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-2 text-slate-600 font-mono">
                <div>
                  <span className="text-[10px] block text-slate-500">WIN RATE</span>
                  <span className="font-bold text-slate-900">{telemetry?.downstream?.retrain?.win_rate || 0}%</span>
                </div>
                <div>
                  <span className="text-[10px] block text-slate-500">MAX DD</span>
                  <span className="font-bold text-slate-900">{telemetry?.downstream?.retrain?.max_drawdown || 0}%</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] font-bold text-slate-500 uppercase">
              DEFECT: RE-TRAIN FREEZE LATENCY
            </div>
          </div>

          {/* Card 4: Alpha & Outperformance Ledger */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  4. NET ALPHA EDGE
                </span>
                <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                  OUTPERFORMANCE
                </span>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xl font-bold text-blue-700 font-mono">
                  {alphaEdge >= 0 ? "+" : ""}
                  ${alphaEdge.toFixed(2)}
                </span>
                <span className="text-xs font-bold text-slate-600 font-mono">
                  vs Static
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-2 text-slate-600 font-mono">
                <div>
                  <span className="text-[10px] block text-slate-500">CIRCUIT BREAKER</span>
                  <span className="font-bold text-blue-700">75% Cut</span>
                </div>
                <div>
                  <span className="text-[10px] block text-slate-500">RECALL SPEED</span>
                  <span className="font-bold text-blue-700">0ms</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] font-bold text-blue-700 uppercase">
              ADVANTAGE: PRESERVES CAPITAL DURING DRIFTS
            </div>
          </div>
        </div>

        {/* Real-time Decision Feed */}
        <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
          <div className="text-xs font-semibold text-slate-600 mb-2 flex justify-between items-center">
            <span>REAL-TIME EXECUTION DECISION STREAM</span>
            <span className="text-[10px] text-slate-500">LIVE ACTION DISPATCH</span>
          </div>
          <div className="max-h-28 overflow-y-auto flex flex-col gap-1 text-xs font-mono">
            {telemetry?.downstream?.recent_actions && telemetry.downstream.recent_actions.length > 0 ? (
              telemetry.downstream.recent_actions.map((act, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center border-b border-slate-200 pb-1 last:border-b-0"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-slate-400 text-[10px]">[{act.timestamp}]</span>
                    <span className="font-bold text-slate-800">
                      ${act.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        act.signal === "BUY" ? "bg-blue-100 text-blue-800" : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {act.signal} ({act.confidence}%)
                    </span>
                    <span className="text-slate-600">{act.risk_action}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {act.drift && (
                      <span className="bg-rose-600 text-white px-1.5 py-0.5 rounded text-[9px] font-bold">
                        DRIFT ALERT
                      </span>
                    )}
                    <span
                      className={`font-bold ${
                        act.adaptive_pnl >= 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      PnL: ${act.adaptive_pnl.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-slate-500 py-2 text-center text-xs">
                Awaiting trade ticks and live decision events...
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 9. Operational Logs & Telemetry Audit Center */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              OPERATIONAL LOGS & TELEMETRY CONSOLE
            </h3>
            {exportNotice && (
              <span className="text-blue-700 text-xs font-semibold">
                ✓ {exportNotice}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowLogsDrawer(!showLogsDrawer)}
            className="text-xs font-semibold px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"
          >
            {showLogsDrawer ? "Hide Console" : "View Console Logs"}
          </button>
        </div>

        {showLogsDrawer && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <div
              ref={logConsoleRef}
              className="h-44 overflow-y-auto bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-[11px] text-slate-800 flex flex-col gap-1"
            >
              {telemetry?.logs && telemetry.logs.length > 0 ? (
                telemetry.logs.map((l, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="text-slate-400">[{l.timestamp}]</span>
                    <span
                      className={`font-semibold ${
                        l.level === "WARNING"
                          ? "text-amber-700"
                          : l.level === "ERROR"
                          ? "text-rose-700"
                          : "text-slate-700"
                      }`}
                    >
                      [{l.level}] {l.message}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-slate-500">Console trace initialized...</div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
