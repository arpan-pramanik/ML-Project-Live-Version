/**
 * Unified Process Orchestrator for Atreus
 * Starts Python ML backend on port 8000 and Next.js frontend on port 3000 concurrently.
 * Handles process lifecycle, health checks, and graceful shutdown.
 */

const { spawn, execSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const PID_FILE = path.join(ROOT_DIR, ".atreus.pids");
const BACKEND_PORT = 8000;
const FRONTEND_PORT = 3000;

function cleanupPort(port) {
  try {
    if (process.platform === "win32") {
      execSync(`for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port}') do taskkill /f /pid %a >nul 2>&1 || exit 0`, { stdio: "ignore" });
    } else {
      try {
        execSync(`docker ps -q --filter "publish=${port}" | xargs -r docker stop >/dev/null 2>&1 || true`, { stdio: "ignore" });
      } catch {}
      execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: "ignore" });
    }
  } catch {}
}

// Clean ports before starting
console.log("\n=======================================================");
console.log("  LAUNCHING STREAMING PLATFORM (BACKEND + FRONTEND)");
console.log("=======================================================\n");

cleanupPort(BACKEND_PORT);
cleanupPort(FRONTEND_PORT);

const pids = [];

// 1. Spawn Python Backend
console.log(`[1/2] Starting Python ML Engine on port ${BACKEND_PORT}...`);
const venvPython = path.join(ROOT_DIR, ".venv", "bin", "python");
const pythonBin = fs.existsSync(venvPython) ? venvPython : "python3";

const backendProcess = spawn(pythonBin, ["app.py", String(BACKEND_PORT)], {
  cwd: ROOT_DIR,
  env: { ...process.env, PYTHONPATH: ROOT_DIR },
  stdio: ["ignore", "pipe", "pipe"],
});

if (backendProcess.pid) pids.push(backendProcess.pid);

backendProcess.stdout.on("data", (data) => {
  const line = data.toString().trim();
  if (line) console.log(`[Backend] ${line}`);
});

backendProcess.stderr.on("data", (data) => {
  const line = data.toString().trim();
  if (line) console.error(`[Backend Error] ${line}`);
});

backendProcess.on("exit", (code) => {
  console.log(`[Backend] Process exited with code ${code}`);
});

// 2. Wait for Backend Health Check, then spawn Next.js Frontend
function checkBackendReady(retries = 20, delay = 300) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/api/hardware`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve(true);
        }
      });

      req.on("error", () => {
        if (attempts >= retries) {
          clearInterval(interval);
          reject(new Error("Backend failed to start in time."));
        }
      });
      req.end();
    }, delay);
  });
}

checkBackendReady()
  .then(() => {
    console.log(`[Backend] Verified ready at http://localhost:${BACKEND_PORT}`);

    // Auto-start live market streaming pipeline with default model & detector
    try {
      const payload = JSON.stringify({
        dataset: "coinbase_btc",
        model: "xgboost_cuda",
        detector: "adwin",
        window_size: 50,
      });
      const autoReq = http.request(
        {
          hostname: "127.0.0.1",
          port: BACKEND_PORT,
          path: "/api/run",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          console.log(`[Pipeline] Auto-started live Coinbase BTC stream (status: ${res.statusCode})`);
        }
      );
      autoReq.on("error", () => {
        console.log("[Pipeline] Note: Pipeline can be started from UI.");
      });
      autoReq.write(payload);
      autoReq.end();
    } catch {}

    console.log(`[2/2] Starting Next.js Frontend on port ${FRONTEND_PORT}...\n`);

    // Determine package manager dynamically
    const extraPath = path.join(process.env.HOME || "", ".npm-global", "bin");
    const runEnv = { ...process.env, PATH: `${extraPath}:${process.env.PATH || ""}` };

    let hasBun = false;
    try {
      execSync(process.platform === "win32" ? "where bun" : "which bun", { env: runEnv, stdio: "ignore" });
      hasBun = true;
    } catch {}

    const frontendCmd = hasBun ? "bun" : (process.platform === "win32" ? "npm.cmd" : "npm");
    const frontendArgs = hasBun
      ? ["run", "--cwd", "frontend", "dev"]
      : ["--prefix", "frontend", "run", "dev"];

    const frontendProcess = spawn(frontendCmd, frontendArgs, {
      cwd: ROOT_DIR,
      env: runEnv,
      stdio: "inherit",
    });

    if (frontendProcess.pid) pids.push(frontendProcess.pid);

    fs.writeFileSync(PID_FILE, JSON.stringify(pids), "utf8");

    frontendProcess.on("exit", (code) => {
      console.log(`[Frontend] Process exited with code ${code}`);
      shutdown();
    });
  })
  .catch((err) => {
    console.error(`[Startup Error] ${err.message}`);
    shutdown();
  });

function shutdown() {
  console.log("\n[Shutdown] Halting all backend and frontend services...");
  cleanupPort(BACKEND_PORT);
  cleanupPort(FRONTEND_PORT);
  pids.forEach((pid) => {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {}
    }
  });
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  console.log("[Shutdown] All services stopped cleanly.\n");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);
