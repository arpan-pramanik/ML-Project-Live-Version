"use client";

import { useEffect, useState, useRef } from "react";

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

interface DownstreamState {
  adaptive: PortfolioState;
  static: PortfolioState;
  retrain: PortfolioState;
  recent_actions: Array<{
    timestamp: string;
    price: number;
    signal: string;
    confidence: number;
    risk_action: string;
    drift: boolean;
    graph_action: string;
    adaptive_pnl: number;
    static_pnl: number;
  }>;
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
}

export default function ControlPanel() {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [datasets, setDatasets] = useState<Array<{ id: string; name: string; type: string }>>([
    { id: "coinbase_btc", name: "Coinbase BTC/USD Live WebSocket", type: "Live Exchange Feed" },
    { id: "coinbase_eth", name: "Coinbase ETH/USD Live WebSocket", type: "Live Exchange Feed" },
    { id: "sea", name: "SEA Concepts Benchmark (5,000 Samples)", type: "Synthetic Abrupt Drift" },
    { id: "agrawal", name: "Agrawal Benchmark (5,000 Samples)", type: "Synthetic Subspace Drift" },
    { id: "electricity", name: "NSW Electricity Market (10,000 Samples)", type: "Real Recurring Concept" },
    { id: "covertype", name: "Forest Covertype Stream (10,000 Samples)", type: "Real Multi-Class Shift" },
    { id: "airlines", name: "Airlines Flight Delay Stream (2,000 Samples)", type: "Real Distribution Drift" },
    { id: "hf_adult", name: "Hugging Face: Adult Census Income (10k)", type: "Hugging Face Stream" },
    { id: "hf_bank", name: "Hugging Face: Bank Marketing Stream (10k)", type: "Hugging Face Stream" },
    { id: "hf_credit", name: "Hugging Face: Credit Default Risk (10k)", type: "Hugging Face Stream" },
  ]);

  const [selectedDataset, setSelectedDataset] = useState("coinbase_btc");
  const [selectedModel, setSelectedModel] = useState("graph_memory_adaptive");
  const [selectedDetector, setSelectedDetector] = useState("adwin");
  const [warmup, setWarmup] = useState(20);
  const [windowSize, setWindowSize] = useState(50);

  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [showLogsDrawer, setShowLogsDrawer] = useState(false);
  const [hfInput, setHfInput] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logConsoleRef = useRef<HTMLDivElement>(null);

  // Poll hardware stats
  const fetchHardware = async () => {
    try {
      const res = await fetch("/api/hardware");
      if (res.ok) {
        const data = await res.json();
        setHardware(data);
      }
    } catch (err) {
      console.warn("Hardware polling failed:", err);
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
    } catch (err) {
      console.warn("Telemetry polling failed:", err);
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
    } catch (err) {
      console.warn("Datasets fetch failed:", err);
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
    } catch (err) {
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

  const handleUploadCsv = async () => {
    if (!fileInputRef.current?.files?.[0]) {
      alert("Please choose a CSV file first.");
      return;
    }
    const file = fileInputRef.current.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      try {
        setUploadStatus("Uploading & validating CSV stream...");
        const res = await fetch("/api/upload_dataset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv_content: content }),
        });
        const data = await res.json();
        if (res.ok) {
          setUploadStatus(`Ready: Loaded ${data.rows} samples with ${data.columns.length} columns.`);
          fetchDatasets();
          setSelectedDataset("custom");
        } else {
          setUploadStatus("Upload failed: " + data.message);
        }
      } catch (err) {
        setUploadStatus("Upload network error.");
      }
    };
    reader.readAsText(file);
  };

  const handleUploadHf = async () => {
    if (!hfInput.trim()) {
      alert("Enter a valid Hugging Face dataset identifier.");
      return;
    }
    try {
      setUploadStatus("Importing dataset from Hugging Face Hub...");
      const res = await fetch("/api/upload_dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hf_id: hfInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setUploadStatus(`Imported ${data.rows} samples with ${data.columns.length} features.`);
        fetchDatasets();
        setSelectedDataset("custom");
      } else {
        setUploadStatus("Hugging Face import error: " + data.message);
      }
    } catch (err) {
      setUploadStatus("Hugging Face network error.");
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
          if (format === "json") filename += ".json";
          else if (format.includes("csv")) filename += ".csv";
          else if (format === "logs") filename += ".txt";
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
    } catch (err) {
      console.warn("API export failed:", err);
    }
  };

  // Trajectory SVG calculations
  const trajectory = telemetry?.trajectory || [];
  const totalSamples = telemetry?.total_samples || 1;
  const maxSample = Math.max(totalSamples, trajectory[trajectory.length - 1]?.sample || 1);
  const svgWidth = 800;
  const svgHeight = 160;
  const padX = 45;
  const padTop = 15;
  const padBottom = 20;
  const plotW = Math.max(10, svgWidth - padX - 15);
  const plotH = svgHeight - padTop - padBottom;

  const getX = (s: number) => padX + (s / maxSample) * plotW;
  const getY = (acc: number) => padTop + plotH - (acc / 100) * plotH;

  let dCum = "";
  let dWin = "";
  let dArea = "";
  const driftLines: number[] = [];

  trajectory.forEach((pt, i) => {
    const x = getX(pt.sample);
    const yC = getY(pt.cumulative_acc);
    const yW = getY(pt.window_acc);

    if (i === 0) {
      dCum += `M ${x} ${yC}`;
      dWin += `M ${x} ${yW}`;
      dArea += `M ${x} ${padTop + plotH} L ${x} ${yC}`;
    } else {
      dCum += ` L ${x} ${yC}`;
      dWin += ` L ${x} ${yW}`;
      dArea += ` L ${x} ${yC}`;
    }

    if (pt.drift === 1) {
      driftLines.push(x);
    }
  });

  if (trajectory.length > 0) {
    const lastX = getX(trajectory[trajectory.length - 1].sample);
    dArea += ` L ${lastX} ${padTop + plotH} Z`;
  }

  const isLiveStream = selectedDataset.startsWith("coinbase") || Boolean(telemetry?.live_stream_status?.running);
  const currentStage = telemetry?.stage || "IDLE";

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 p-4 md:p-6 flex flex-col gap-5">
      {/* 1. Header & Navigation Bar */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#0f172a] border border-[#1e293b] rounded-xl px-5 py-3.5 shadow-lg">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-indigo-600 via-cyan-500 to-emerald-400 flex items-center justify-center font-black text-white text-xl tracking-tight shadow-md">
            AT
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">ATREUS STREAMING PLATFORM</h1>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                v2026.4
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Online Machine Learning & Adaptive Concept Drift Architecture
            </p>
          </div>
        </div>

        {/* Live Hardware & Telemetry Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-[#1e293b]/70 border border-[#334155] rounded-lg px-3 py-1.5 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300 font-medium">
              {hardware?.cpu ? `${hardware.cpu.threads} CPU Threads` : "CPU Active"}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-cyan-400 font-medium">
              {hardware?.gpu?.cuda_available ? `${hardware.gpu.model} (CUDA)` : "CPU Stream Mode"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!telemetry?.running ? (
              <button
                type="button"
                onClick={handleStart}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wide transition shadow-md hover:shadow-emerald-500/25 cursor-pointer"
              >
                <span>▶</span> Start Stream
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wide transition shadow-md hover:shadow-rose-600/25 cursor-pointer"
              >
                <span>⏹</span> Halt Stream
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowConfigDrawer(!showConfigDrawer)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1e293b] hover:bg-[#334155] text-slate-200 text-xs font-semibold border border-[#334155] transition cursor-pointer"
            >
              <span>⚙</span> Configure
            </button>

            <button
              type="button"
              onClick={() => triggerExport("json")}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1e293b] hover:bg-[#334155] text-slate-200 text-xs font-semibold border border-[#334155] transition cursor-pointer"
            >
              <span>↓</span> Export
            </button>
          </div>
        </div>
      </header>

      {/* 2. Live Market Hero Ribbon (When Coinbase or Live Stream is running) */}
      <section className="bg-gradient-to-r from-[#0f172a] via-[#131f37] to-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-[#1e293b] border border-[#334155] flex items-center justify-center">
              <span className="text-2xl">🪙</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">
                  ACTIVE DATA SOURCE:
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold uppercase">
                  {isLiveStream ? "LIVE WEBSOCKET STREAM" : "BENCHMARK STREAM"}
                </span>
                <span className="text-xs text-slate-300 font-semibold">
                  {datasets.find((d) => d.id === selectedDataset)?.name || selectedDataset}
                </span>
              </div>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-2xl md:text-3xl font-extrabold tracking-tight text-white font-mono">
                  {isLiveStream && telemetry?.live_stream_status?.latest_price
                    ? `$${telemetry.live_stream_status.latest_price.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    : `Sample #${(telemetry?.current_sample || 0).toLocaleString()}`}
                </span>
                {isLiveStream && (
                  <span className="text-xs font-medium text-slate-400">
                    Tick Velocity:{" "}
                    <strong className="text-emerald-400 font-mono">
                      {telemetry?.live_stream_status?.tick_rate || 0} ticks/sec
                    </strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Real-time State Badges */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="bg-[#1e293b]/90 border border-[#334155] rounded-xl px-3 py-2 text-right">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                CONCEPT REGIME STATE
              </div>
              <div className="text-xs font-bold text-cyan-300">
                {telemetry?.graph_memory?.nodes?.find((n) => n.is_active)?.label || "Regime #0: Stationary"}
              </div>
            </div>

            <div className="bg-[#1e293b]/90 border border-[#334155] rounded-xl px-3 py-2 text-right">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                DRIFT DETECTOR
              </div>
              <div className="flex items-center gap-1.5 justify-end">
                <span
                  className={`w-2 h-2 rounded-full ${
                    telemetry?.stage === "DRIFT_ADAPTING"
                      ? "bg-rose-500 animate-ping"
                      : "bg-emerald-400"
                  }`}
                />
                <span
                  className={`text-xs font-bold ${
                    telemetry?.stage === "DRIFT_ADAPTING" ? "text-rose-400" : "text-emerald-400"
                  }`}
                >
                  {telemetry?.stage === "DRIFT_ADAPTING" ? "DRIFT DETECTED" : "EQUILIBRIUM"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Stream Configuration Modal/Drawer */}
      {showConfigDrawer && (
        <section className="bg-[#0f172a] border border-[#334155] rounded-xl p-5 shadow-2xl animate-in fade-in duration-200">
          <div className="flex justify-between items-center border-b border-[#1e293b] pb-3 mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <span>⚙</span> Stream & Architecture Configuration
            </h2>
            <button
              type="button"
              onClick={() => setShowConfigDrawer(false)}
              className="text-slate-400 hover:text-white text-sm px-2 py-0.5 rounded hover:bg-[#1e293b]"
            >
              ✕ Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Target Data Stream
              </label>
              <select
                className="w-full bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                ML Model Architecture
              </label>
              <select
                className="w-full bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                <option value="graph_memory_adaptive">
                  Graph Memory Concept Topology Adaptive Model (0ms Recall)
                </option>
                <option value="drift_moe">
                  DriftMoE (2026 Mixture of Experts + RTX 5070 CUDA)
                </option>
                <option value="proposed">
                  Proposed Selective Adapt (RF + SVM + Online Scaler)
                </option>
                <option value="boosted_forest">
                  Boosted ARF-DWM Forest (Shadow Trees)
                </option>
                <option value="dual_memory">
                  Self-Healing Dual-Memory Meta-Ensemble
                </option>
                <option value="xgboost_cuda">
                  Hardware-Accelerated Adaptive XGBoost (CUDA)
                </option>
                <option value="adaptive_svm">
                  Adaptive Online SVM (Incremental Margin)
                </option>
                <option value="full_retrain">Full Retraining (Baseline)</option>
                <option value="static">Static Streaming Model (No Adapt)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Online Drift Detector
              </label>
              <select
                className="w-full bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={selectedDetector}
                onChange={(e) => setSelectedDetector(e.target.value)}
              >
                <option value="adwin">ADWIN (Adaptive Sliding Window)</option>
                <option value="ddm">DDM (Drift Detection Method)</option>
                <option value="eddm">EDDM (Early Drift Detection Method)</option>
                <option value="page_hinkley">Page-Hinkley Cumulative Sum</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-3 border-t border-[#1e293b]">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Warmup Samples (Bootstrap Window)
              </label>
              <input
                type="number"
                className="w-full bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-1.5 text-xs text-white"
                value={warmup}
                onChange={(e) => setWarmup(parseInt(e.target.value) || 20)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Rolling Evaluation Window (Samples)
              </label>
              <input
                type="number"
                className="w-full bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-1.5 text-xs text-white"
                value={windowSize}
                onChange={(e) => setWindowSize(parseInt(e.target.value) || 50)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-[#1e293b]">
            <button
              type="button"
              onClick={handleStart}
              className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wide cursor-pointer"
            >
              Apply & Run Pipeline
            </button>
          </div>
        </section>
      )}

      {/* 4. Core Performance Metrics Grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow">
          <div className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
            PREQUENTIAL ACCURACY
          </div>
          <div className="text-2xl md:text-3xl font-extrabold text-white mt-1 font-mono">
            {(telemetry?.accuracy || 0).toFixed(2)}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
            <span className="text-emerald-400">●</span> Cumulative Stream Scoring
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow">
          <div className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
            WINDOWED ACCURACY
          </div>
          <div className="text-2xl md:text-3xl font-extrabold text-cyan-400 mt-1 font-mono">
            {(telemetry?.window_accuracy || 0).toFixed(2)}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Last {windowSize} Rolling Samples
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow">
          <div className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
            CONCEPT DRIFT SIGNALS
          </div>
          <div className="text-2xl md:text-3xl font-extrabold text-amber-400 mt-1 font-mono">
            {telemetry?.drift_count || 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {telemetry?.adaptation_count || 0} Selective Adaptations
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow">
          <div className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
            ADAPTATION LATENCY
          </div>
          <div className="text-2xl md:text-3xl font-extrabold text-emerald-400 mt-1 font-mono">
            {(telemetry?.adaptation_time_ms || 0).toFixed(2)} ms
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Throughput: {telemetry?.throughput || 0} samples/sec
          </div>
        </div>
      </section>

      {/* 5. Live Stream Accuracy Trajectory Area Chart */}
      <section className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow-lg">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-[#1e293b] pb-2.5 mb-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              REAL-TIME ACCURACY & DRIFT TRAJECTORY DYNAMICS
            </h2>
            <p className="text-[11px] text-slate-400">
              Sample-by-sample prequential validation trajectory with automated drift marker events
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-3 h-0.5 bg-cyan-400 rounded-full" /> Cumulative Acc
            </span>
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-3 h-0.5 bg-slate-400 stroke-dasharray rounded-full" /> Windowed Acc
            </span>
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> Drift Flag
            </span>
          </div>
        </div>

        <div className="w-full h-44 relative bg-[#090d16] rounded-lg overflow-hidden border border-[#1e293b]">
          <svg width="100%" height="176" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid Horizontal Ticks */}
            <line x1={padX} y1={20} x2={svgWidth} y2={20} stroke="#1e293b" strokeWidth="1" />
            <text x="8" y="24" fontSize="9" fill="#64748b" fontFamily="monospace">
              100%
            </text>
            <line x1={padX} y1={55} x2={svgWidth} y2={55} stroke="#1e293b" strokeWidth="1" />
            <text x="8" y="59" fontSize="9" fill="#64748b" fontFamily="monospace">
              75%
            </text>
            <line x1={padX} y1={90} x2={svgWidth} y2={90} stroke="#1e293b" strokeWidth="1" />
            <text x="8" y="94" fontSize="9" fill="#64748b" fontFamily="monospace">
              50%
            </text>
            <line x1={padX} y1={125} x2={svgWidth} y2={125} stroke="#1e293b" strokeWidth="1" />
            <text x="8" y="129" fontSize="9" fill="#64748b" fontFamily="monospace">
              25%
            </text>
            <line x1={padX} y1={145} x2={svgWidth} y2={145} stroke="#334155" strokeWidth="1" />

            {/* Drift Vertical Event Lines */}
            {driftLines.map((dx, i) => (
              <g key={i}>
                <line
                  x1={dx}
                  y1={padTop}
                  x2={dx}
                  y2={svgHeight - padBottom}
                  stroke="#f43f5e"
                  strokeWidth="1.5"
                  strokeDasharray="3,3"
                />
                <circle cx={dx} cy={svgHeight - padBottom} r="3" fill="#f43f5e" />
              </g>
            ))}

            {/* Smooth Area Gradient */}
            {dArea && <path d={dArea} fill="url(#areaGradient)" />}

            {/* Cumulative Accuracy Path */}
            {dCum && <path d={dCum} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" />}

            {/* Windowed Accuracy Path */}
            {dWin && (
              <path
                d={dWin}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="1.5"
                strokeDasharray="4,4"
              />
            )}
          </svg>
        </div>
      </section>

      {/* 6. Concept Topology Graph Memory Visualizer (Lifelong Learning) */}
      <section className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-[#1e293b] pb-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                CONCEPT TOPOLOGY GRAPH MEMORY
              </h2>
              <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full">
                LIFELONG CONTINUAL LEARNING
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Topological regime network resolving recurring concepts with instant 0ms recall
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">LAST ACTION:</span>
            <span className="px-2.5 py-1 rounded bg-[#1e293b] border border-[#334155] text-xs font-bold text-white font-mono">
              {telemetry?.graph_memory?.last_action || "INITIALIZED"}
            </span>
          </div>
        </div>

        {/* Graph Memory Telemetry Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
          <div className="bg-[#1e293b]/50 border border-[#334155] rounded-lg p-2.5">
            <div className="text-[10px] uppercase font-semibold text-slate-400">DISCOVERED REGIMES</div>
            <div className="text-lg font-bold text-white mt-0.5">
              {telemetry?.graph_memory?.total_nodes || 1} Nodes
            </div>
            <div className="text-[10px] text-slate-500">Topological States</div>
          </div>

          <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-lg p-2.5">
            <div className="text-[10px] uppercase font-semibold text-emerald-400">INSTANT RECALLS</div>
            <div className="text-lg font-bold text-emerald-300 mt-0.5 font-mono">
              {telemetry?.graph_memory?.recall_count || 0}
            </div>
            <div className="text-[10px] text-emerald-500 font-bold">0ms Retraining Time</div>
          </div>

          <div className="bg-[#1e293b]/50 border border-[#334155] rounded-lg p-2.5">
            <div className="text-[10px] uppercase font-semibold text-slate-400">NOVEL REGIME SPAWNS</div>
            <div className="text-lg font-bold text-white mt-0.5">
              {telemetry?.graph_memory?.spawn_count || 0}
            </div>
            <div className="text-[10px] text-slate-500">Unseen Distributions</div>
          </div>

          <div className="bg-[#1e293b]/50 border border-[#334155] rounded-lg p-2.5">
            <div className="text-[10px] uppercase font-semibold text-slate-400">ACTIVE REGIME</div>
            <div className="text-sm font-bold text-cyan-300 mt-1 truncate">
              Regime #{telemetry?.graph_memory?.active_node_id ?? 0}
            </div>
            <div className="text-[10px] text-slate-500">Active Expert Head</div>
          </div>

          <div className="bg-[#1e293b]/50 border border-[#334155] rounded-lg p-2.5">
            <div className="text-[10px] uppercase font-semibold text-slate-400">CENTROID DISTANCE</div>
            <div className="text-sm font-bold text-white mt-1 font-mono">
              {telemetry?.graph_memory?.last_distance || 0.0}
            </div>
            <div className="text-[10px] text-slate-500">
              Threshold: {telemetry?.graph_memory?.similarity_threshold || 1.8}
            </div>
          </div>

          <div className="bg-[#1e293b]/50 border border-[#334155] rounded-lg p-2.5">
            <div className="text-[10px] uppercase font-semibold text-slate-400">ANTICIPATED NEXT</div>
            <div className="text-sm font-bold text-slate-200 mt-1 truncate">
              Regime #{telemetry?.graph_memory?.next_predicted_regime ?? 0}
            </div>
            <div className="text-[10px] text-indigo-400 font-semibold font-mono">
              {telemetry?.graph_memory?.next_predicted_probability || 0}% Markov Prob
            </div>
          </div>
        </div>

        {/* Dynamic Concept Node Cards Network */}
        <div className="border border-[#1e293b] rounded-xl p-3 bg-[#090d16] mb-3">
          <div className="text-xs font-semibold text-slate-400 mb-2 flex justify-between items-center">
            <span>DISCOVERED REGIME EXPERTS</span>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Glowing Ring = Active Regime
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            {telemetry?.graph_memory?.nodes && telemetry.graph_memory.nodes.length > 0 ? (
              telemetry.graph_memory.nodes.map((node) => (
                <div
                  key={node.id}
                  className={`rounded-lg p-3 transition border ${
                    node.is_active
                      ? "bg-[#1e293b] border-emerald-500 ring-2 ring-emerald-500/30 glow-active"
                      : "bg-[#0f172a] border-[#1e293b] hover:border-[#334155]"
                  }`}
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-bold text-white truncate">{node.label}</span>
                    {node.is_active && (
                      <span className="bg-emerald-500 text-slate-950 font-extrabold text-[8px] px-1.5 py-0.5 rounded uppercase">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-400 border-t border-[#1e293b] pt-1.5 mt-1 font-mono">
                    <span>{node.samples.toLocaleString()} Samples</span>
                    <span className="font-bold text-emerald-400">{node.accuracy}% Acc</span>
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
            <span className="text-[10px] uppercase font-bold text-slate-400 whitespace-nowrap">
              MARKOV TRANSITIONS:
            </span>
            <div className="flex gap-2">
              {telemetry.graph_memory.edges.slice(-6).map((edge, idx) => (
                <span
                  key={idx}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono whitespace-nowrap border ${
                    edge.is_active_transition
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-bold"
                      : "bg-[#1e293b] text-slate-400 border-[#334155]"
                  }`}
                >
                  Regime #{edge.from} → #{edge.to} ({(edge.probability * 100).toFixed(0)}%)
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 7. Downstream Execution & Dynamic Risk Management Cockpit */}
      <section className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-[#1e293b] pb-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                DOWNSTREAM EXECUTION & DYNAMIC RISK MANAGEMENT COCKPIT
              </h2>
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full">
                3-WAY CAPITAL BENCHMARK
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Simulated real-time portfolio execution comparing Adaptive vs Static vs Full Retrain
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Initial Capital: <strong className="text-white">$10,000.00</strong>
          </span>
        </div>

        {/* 3-Way Comparative Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Card 1: Graph Memory Adaptive Model (Our Framework) */}
          <div className="bg-gradient-to-b from-[#132238] to-[#0f172a] border-2 border-emerald-500/60 rounded-xl p-4 shadow-md flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
                  1. GRAPH ADAPTIVE MODEL
                </span>
                <span className="bg-emerald-500 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">
                  OUR MODEL
                </span>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xl font-extrabold text-white font-mono">
                  ${(telemetry?.downstream?.adaptive?.capital || 10000).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span
                  className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                    (telemetry?.downstream?.adaptive?.pnl || 0) >= 0
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-rose-500/15 text-rose-400"
                  }`}
                >
                  {(telemetry?.downstream?.adaptive?.pnl || 0) >= 0 ? "+" : ""}
                  {(telemetry?.downstream?.adaptive?.pnl || 0).toFixed(2)} (
                  {(telemetry?.downstream?.adaptive?.pnl_pct || 0).toFixed(2)}%)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs border-t border-[#1e293b] pt-2 text-slate-400 font-mono">
                <div>
                  <span className="text-[10px] block text-slate-500 uppercase">WIN RATE</span>
                  <span className="font-bold text-white">
                    {telemetry?.downstream?.adaptive?.win_rate || 0}%
                  </span>
                </div>
                <div>
                  <span className="text-[10px] block text-slate-500 uppercase">POSITION</span>
                  <span className="font-bold text-white">
                    {(telemetry?.downstream?.adaptive?.position || 0) > 0 ? "+" : ""}
                    {telemetry?.downstream?.adaptive?.position || 0}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] block text-slate-500 uppercase">MAX DD</span>
                  <span className="font-bold text-white">
                    {telemetry?.downstream?.adaptive?.max_drawdown || 0}%
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-[#1e293b] text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
              PROTOCOL: {telemetry?.downstream?.adaptive?.risk_status || "NORMAL (100% Budget)"}
            </div>
          </div>

          {/* Card 2: Static Baseline Model */}
          <div className="bg-[#0f172a] border border-[#334155] rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                  2. STATIC MODEL (NO ADAPT)
                </span>
                <span className="bg-slate-800 text-slate-400 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                  FROZEN
                </span>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xl font-extrabold text-white font-mono">
                  ${(telemetry?.downstream?.static?.capital || 10000).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span
                  className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                    (telemetry?.downstream?.static?.pnl || 0) >= 0
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-rose-500/15 text-rose-400"
                  }`}
                >
                  {(telemetry?.downstream?.static?.pnl || 0) >= 0 ? "+" : ""}
                  {(telemetry?.downstream?.static?.pnl || 0).toFixed(2)} (
                  {(telemetry?.downstream?.static?.pnl_pct || 0).toFixed(2)}%)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs border-t border-[#1e293b] pt-2 text-slate-400 font-mono">
                <div>
                  <span className="text-[10px] block text-slate-500 uppercase">WIN RATE</span>
                  <span className="font-bold text-white">
                    {telemetry?.downstream?.static?.win_rate || 0}%
                  </span>
                </div>
                <div>
                  <span className="text-[10px] block text-slate-500 uppercase">POSITION</span>
                  <span className="font-bold text-white">
                    {telemetry?.downstream?.static?.position || 0}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] block text-slate-500 uppercase">MAX DD</span>
                  <span className="font-bold text-white">
                    {telemetry?.downstream?.static?.max_drawdown || 0}%
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-[#1e293b] text-[10px] font-bold text-rose-400 uppercase tracking-wide">
              DEFECT: DRAWS DOWN CATASTROPHICALLY ON REGIME SHIFTS
            </div>
          </div>

          {/* Card 3: Full Retrain Baseline */}
          <div className="bg-[#0f172a] border border-[#334155] rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                  3. FULL RETRAINING BASELINE
                </span>
                <span className="bg-slate-800 text-slate-400 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                  PERIODIC REFIT
                </span>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xl font-extrabold text-white font-mono">
                  ${(telemetry?.downstream?.retrain?.capital || 10000).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span
                  className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                    (telemetry?.downstream?.retrain?.pnl || 0) >= 0
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-rose-500/15 text-rose-400"
                  }`}
                >
                  {(telemetry?.downstream?.retrain?.pnl || 0) >= 0 ? "+" : ""}
                  {(telemetry?.downstream?.retrain?.pnl || 0).toFixed(2)} (
                  {(telemetry?.downstream?.retrain?.pnl_pct || 0).toFixed(2)}%)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs border-t border-[#1e293b] pt-2 text-slate-400 font-mono">
                <div>
                  <span className="text-[10px] block text-slate-500 uppercase">WIN RATE</span>
                  <span className="font-bold text-white">
                    {telemetry?.downstream?.retrain?.win_rate || 0}%
                  </span>
                </div>
                <div>
                  <span className="text-[10px] block text-slate-500 uppercase">POSITION</span>
                  <span className="font-bold text-white">
                    {telemetry?.downstream?.retrain?.position || 0}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] block text-slate-500 uppercase">MAX DD</span>
                  <span className="font-bold text-white">
                    {telemetry?.downstream?.retrain?.max_drawdown || 0}%
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-[#1e293b] text-[10px] font-bold text-amber-400 uppercase tracking-wide">
              DEFECT: HIGH RE-TRAINING LATENCY FREEZES STREAM INFERENCE
            </div>
          </div>
        </div>

        {/* Real-time Decision & Action Feed */}
        <div className="border border-[#1e293b] rounded-xl p-3 bg-[#090d16]">
          <div className="text-xs font-semibold text-slate-400 mb-2 flex justify-between items-center">
            <span>REAL-TIME EXECUTION DECISION STREAM</span>
            <span className="text-[10px] text-slate-500">LIVE ACTION DISPATCH</span>
          </div>
          <div className="max-h-28 overflow-y-auto flex flex-col gap-1.5 text-xs font-mono">
            {telemetry?.downstream?.recent_actions && telemetry.downstream.recent_actions.length > 0 ? (
              telemetry.downstream.recent_actions.map((act, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center border-b border-[#1e293b] pb-1 last:border-b-0"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-slate-500 text-[10px]">[{act.timestamp}]</span>
                    <span className="font-bold text-white">
                      ${act.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        act.signal === "BUY"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-rose-500/20 text-rose-400"
                      }`}
                    >
                      {act.signal} ({act.confidence}%)
                    </span>
                    <span className="text-slate-300">{act.risk_action}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {act.drift && (
                      <span className="bg-rose-500 text-white px-1.5 py-0.5 rounded text-[9px] font-bold">
                        DRIFT ALERT
                      </span>
                    )}
                    <span
                      className={`font-bold ${
                        act.adaptive_pnl >= 0 ? "text-emerald-400" : "text-rose-400"
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

      {/* 8. Collapsible Operational Logs & Telemetry Audit Center */}
      <section className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              OPERATIONAL LOGS & TELEMETRY CONSOLE
            </h3>
            {exportNotice && (
              <span className="text-emerald-400 text-xs font-semibold animate-pulse">
                ✓ {exportNotice}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowLogsDrawer(!showLogsDrawer)}
            className="text-xs font-semibold px-3 py-1 rounded bg-[#1e293b] hover:bg-[#334155] text-slate-300 border border-[#334155] transition"
          >
            {showLogsDrawer ? "Hide Console" : "View Console Logs"}
          </button>
        </div>

        {showLogsDrawer && (
          <div className="mt-3 pt-3 border-t border-[#1e293b]">
            <div
              ref={logConsoleRef}
              className="h-44 overflow-y-auto bg-[#090d16] border border-[#1e293b] rounded-lg p-3 font-mono text-[11px] text-slate-300 flex flex-col gap-1"
            >
              {telemetry?.logs && telemetry.logs.length > 0 ? (
                telemetry.logs.map((l, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="text-slate-500">[{l.timestamp}]</span>
                    <span
                      className={`font-semibold ${
                        l.level === "WARNING"
                          ? "text-amber-400"
                          : l.level === "ERROR"
                          ? "text-rose-400"
                          : "text-slate-300"
                      }`}
                    >
                      [{l.level}] {l.message}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-slate-600">Console trace initialized...</div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
