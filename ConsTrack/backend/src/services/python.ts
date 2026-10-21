// Node → Python bridge: spawns each Python script as a child process and parses its JSON stdout.
import path from "path";
import { spawn, ChildProcess } from "child_process";

const ROOT = path.resolve(process.cwd());

// Hard ceiling per Python step. Acts as a backstop so a genuinely stuck or
// pathologically-slow computation (e.g. DBSCAN ball_tree on millions of "new"
// points) returns a clean 500 + reaps the process instead of zombie-hanging
// until the socket dies. 20 min covers RANSAC/ICP on large (20M+ point) clouds;
// kept under the 30 min Express server.timeout (index.ts) so the client gets a
// JSON error rather than a TCP "socket hang up". NOTE: steps run sequentially,
// so the worst-case request is ~3x this — see index.ts for the request budget.
const DEFAULT_TIMEOUT_MS = Number(process.env.PYTHON_TIMEOUT_MS || 20 * 60_000);

// After the child process exits we wait this long for the OS pipe to deliver
// the final stdout chunk (the JSON payload) before parsing. The data is already
// in the pipe buffer at exit, so this only needs to cover one IO poll.
const STDOUT_FLUSH_GRACE_MS = 500;

function killTree(child: ChildProcess): void {
  if (child.pid == null) return;
  try {
    if (process.platform === "win32") {
      // SIGKILL on Windows doesn't reap the child's own subprocesses; taskkill /t does.
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      child.kill("SIGKILL");
    }
  } catch {
    /* best effort — we're already rejecting */
  }
}

/**
 * Spawn a Python script and resolve with its parsed JSON stdout.
 *
 * Why this settles on 'exit' and not just 'close'
 * ------------------------------------------------
 * Node's 'close' event fires only after the child has exited AND every copy of
 * its stdout/stderr pipe write-end has been closed. change_detector.py runs
 * sklearn DBSCAN with n_jobs=-1, which spins up a joblib/loky worker POOL. Those
 * worker subprocesses are grandchildren of Node and inherit copies of the
 * stdout/stderr pipe FDs. loky keeps the pool idle-alive (~300 s) for reuse, so
 * even after the main Python process exits and has flushed its JSON, the pipe
 * write-end stays open — 'close' never fires, the Promise never settles, and the
 * HTTP request hangs until the socket times out ("socket hang up"). That is the
 * zombie request.
 *
 * The main process exiting is the authoritative "work is done" signal: by then
 * the JSON has been printed and the output file written. So we settle on 'exit'
 * (after a short grace period to collect the trailing stdout chunk) and stop
 * caring whether lingering grandchildren ever close the pipe. 'close' stays as
 * the fast path for scripts that don't spawn subprocesses. A timeout kills the
 * whole process tree as a last resort.
 */
function runPython<T = unknown>(
  label: string,
  scriptName: string,
  args: string[],
  opts: { timeoutMs?: number } = {}
): Promise<T> {
  const py = process.env.PYTHON_PATH || "python3";
  const script = path.join(ROOT, "python", scriptName);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<T>((resolve, reject) => {
    const child = spawn(py, [script, ...args], { stdio: ["ignore", "pipe", "pipe"] });

    let out = "";
    let err = "";
    let settled = false;
    let timer: NodeJS.Timeout;

    child.stdout.on("data", (d) => {
      out += String(d);
    });
    child.stderr.on("data", (d) => {
      const chunk = String(d);
      err += chunk;
      // Surface Python's progress log live instead of swallowing it until failure.
      // This is what makes the freeze point visible: you see the last line Python
      // printed (e.g. "DBSCAN: eps=15 cm ...") and then silence.
      process.stderr.write(`[py:${label}] ${chunk}`);
    });

    const cleanup = () => {
      clearTimeout(timer);
      // Drop our read handles so a lingering grandchild that inherited the pipe
      // can't keep this stream — or the event loop — pinned after we've settled.
      child.stdout?.destroy();
      child.stderr?.destroy();
    };

    const settle = (code: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();

      // Python uses exit code 2 to carry a structured {"error": "..."} payload.
      if (code !== 0 && code !== 2) {
        return reject(new Error(`${label} exited with code ${code}.\n${err.trim()}`));
      }
      let parsed: { error?: string } & Record<string, unknown>;
      try {
        // Bulletproof parse: stdout may carry stray non-JSON noise (e.g. a C++
        // "[Open3D WARNING] ..." line that slipped past verbosity suppression).
        // The payload is a single JSON object, so slice from the first "{" to
        // the last "}" and parse only that span.
        const raw = out.trim();
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        const jsonText = start !== -1 && end > start ? raw.slice(start, end + 1) : raw;
        parsed = JSON.parse(jsonText || "{}");
      } catch {
        return reject(
          new Error(`${label}: could not parse JSON from stdout.\nstdout: ${out}\nstderr: ${err}`)
        );
      }
      if (parsed.error) return reject(new Error(`${label}: ${parsed.error}`));
      resolve(parsed as T);
    };

    // Fast path: process exited and all stdio drained/closed.
    child.on("close", (code) => settle(code));

    // Safety net for the zombie request: main process exited (we have its code +
    // flushed stdout) but a grandchild holds the pipe, so 'close' won't come.
    child.on("exit", (code) => {
      setTimeout(() => settle(code), STDOUT_FLUSH_GRACE_MS);
    });

    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new Error(
          `Failed to start ${label} ("${py}"): ${e.message}. ` +
            `Ensure Python 3 is on PATH (or set PYTHON_BIN) and that open3d, numpy, ` +
            `scipy, scikit-learn and laspy are installed.`
        )
      );
    });

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      killTree(child);
      reject(new Error(`${label} timed out after ${timeoutMs} ms and was killed.`));
    }, timeoutMs);
  });
}

export async function runPythonVolumeOne(
  filePath: string,
  voxelSize: number = 0.05
): Promise<{ volumeM3: number; voxelCount: number }> {
  return runPython("volume_one", "volume_diff.py", [
    "--single", filePath,
    "--voxel",  String(voxelSize),
  ]);
}

export interface StandardizeResult {
  cleanedPlyPath: string;
  originalPointCount: number;
  cleanedPointCount: number;
  elapsedS: number;
}

export async function runPythonStandardize(
  inputPath: string,
  outputPath: string,
  opts: { sorK?: number; sorStd?: number } = {}
): Promise<StandardizeResult> {
  return runPython<StandardizeResult>("standardizer", "standardizer.py", [
    "--input", inputPath,
    "--output", outputPath,
    "--sor_k", String(opts.sorK ?? 20),
    "--sor_std", String(opts.sorStd ?? 2.0),
  ]);
}

export interface PreprocessResult {
  fitness: number;
  rmseM: number;
  rmseCm: number;
  alignmentConfidence: "HIGH" | "MEDIUM" | "LOW";
  transformMatrix: number[][];
  alignedT2Path: string;
  cleanedT1Path?: string;
  elapsedS: number;
}

export async function runPythonPreprocess(
  t1Path: string,
  t2Path: string,
  outT2Path: string,
  outT1Path?: string,
  opts: { voxelSize?: number; sorK?: number; sorStd?: number; icpDist?: number } = {}
): Promise<PreprocessResult> {
  const args = [
    "--t1", t1Path,
    "--t2", t2Path,
    "--out_t2", outT2Path,
    "--voxel", String(opts.voxelSize ?? 0.05),
    "--sor_k", String(opts.sorK ?? 20),
    "--sor_std", String(opts.sorStd ?? 2.0),
    "--icp_dist", String(opts.icpDist ?? 0.10),
  ];
  if (outT1Path) args.push("--out_t1", outT1Path);
  return runPython<PreprocessResult>("preprocessor", "preprocessor.py", args);
}

export interface ClusterInfo {
  clusterId: number;
  pointCount: number;
  centroidXYZ: [number, number, number];
  voxelVolumeM3: number;
  obbVolumeM3: number;
  obbExtentM: [number, number, number];
  hullVolumeM3: number;
  hullDegenerate: boolean;
}

/** One direction of the bidirectional comparison (added OR removed). */
export interface DeltaResult {
  volumeM3: number;
  pointCount: number;
  elementCount: number;
  noisePointCount: number;
  clusters: ClusterInfo[];
  /** PLY path Python wrote, or null when this side had zero delta points. */
  path: string | null;
}

// One matched pair from displacement analysis — cluster gone from one spot, appeared at another.
export interface DisplacementEvent {
  fromClusterId: number;
  toClusterId: number;
  fromCentroid: [number, number, number];
  toCentroid: [number, number, number];
  displacementM: number;
  volumeM3: number;
}

// Aggregated output from change_detector.py's displacement matching step.
export interface DisplacementResult {
  events: DisplacementEvent[];
  newConstructionM3: number;
  demolitionM3: number;
  displacementM3: number;
  stats: {
    addedClusters: number;
    removedClusters: number;
    matched: number;
    unmatchedAdded: number;
    unmatchedRemoved: number;
    volumeBasis: "hull" | "obb" | "voxel";
    degenerateClusterCount: number;
  };
}

export interface ChangeDetectResult {
  added: DeltaResult;
  removed: DeltaResult;
  elapsedS: number;
  /** Present unless --no-displacement was passed. */
  displacement?: DisplacementResult;
}

export async function runPythonChangeDetect(
  t1Path: string,
  t2AlignedPath: string,
  outAddedPath: string,
  outRemovedPath: string,
  opts: { distThresh?: number; voxelSize?: number; eps?: number; minPts?: number } = {}
): Promise<ChangeDetectResult> {
  return runPython<ChangeDetectResult>("change_detector", "change_detector.py", [
    "--t1", t1Path,
    "--t2_aligned", t2AlignedPath,
    "--out_added", outAddedPath,
    "--out_removed", outRemovedPath,
    "--dist_thresh", String(opts.distThresh ?? 0.05),
    "--voxel", String(opts.voxelSize ?? 0.05),
    "--eps", String(opts.eps ?? 0.15),
    "--min_pts", String(opts.minPts ?? 20),
  ]);
}

export async function runPythonExtractPoints(filePath: string, maxPoints: number = 350000) {
  const parsed = await runPython<{ points?: number[][]; colors?: number[][] }>(
    "extract_points",
    "volume_diff.py",
    ["--extract", filePath, "--max_extract_points", String(maxPoints)]
  );
  return { points: parsed.points || [], colors: parsed.colors };
}
