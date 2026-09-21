import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  AlgorithmCaseResult,
  AlgorithmMode,
  AlgorithmRunResult,
  AlgorithmRuntimeInfo,
  AlgorithmVerdict,
} from "../../shared/contracts/algorithm-practice";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_OUTPUT_LIMIT_BYTES = 4 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 3_000;

type AlgorithmExecutionResult = Omit<AlgorithmRunResult, "submissionId" | "slug" | "mode" | "progress">;

type RuntimeCandidate = {
  command: string;
  prefixArguments: string[];
  source: AlgorithmRuntimeInfo["source"];
  displayName: string;
};

type ResolvedRuntime = RuntimeCandidate & {
  version: string;
};

export type PythonAlgorithmRunnerOptions = {
  resourceDirectory: string;
  configuredPythonPath?: string;
  timeoutMs?: number;
  outputLimitBytes?: number;
  /** Test seam; production callers should let the runner discover runtimes. */
  runtimeCandidates?: RuntimeCandidate[];
};

export type PythonAlgorithmRunnerPort = {
  getRuntimeInfo(): Promise<AlgorithmRuntimeInfo>;
  run(request: { slug: string; mode: AlgorithmMode; code: string }): Promise<AlgorithmExecutionResult>;
  close(): Promise<void> | void;
};

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function truncate(value: unknown, limit = 24_000): string {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  return text.length <= limit ? text : `${text.slice(0, limit)}\n…（内容已截断）`;
}

function minimalEnvironment(temporaryDirectory?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONHASHSEED: "0",
  };
  for (const key of ["SYSTEMROOT", "WINDIR", "PATH", "PATHEXT", "LD_LIBRARY_PATH", "LANG", "LC_ALL"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  if (temporaryDirectory) {
    env.TEMP = temporaryDirectory;
    env.TMP = temporaryDirectory;
    env.TMPDIR = temporaryDirectory;
  }
  return env;
}

function defaultCandidates(resourceDirectory: string, configuredPythonPath?: string): RuntimeCandidate[] {
  const candidates: RuntimeCandidate[] = [];
  const packagedRoot = dirname(resourceDirectory);
  const embedded = process.platform === "win32"
    ? join(packagedRoot, "python", "python.exe")
    : join(packagedRoot, "python", "bin", "python3");
  candidates.push({ command: embedded, prefixArguments: [], source: "embedded", displayName: "内置 Python" });
  const configured = configuredPythonPath?.trim() || process.env.PI_DESKTOP_PYTHON?.trim();
  if (configured) {
    candidates.push({ command: configured, prefixArguments: [], source: "configured", displayName: "已配置 Python" });
  }
  if (process.platform === "win32") {
    const userHome = process.env.USERPROFILE || homedir();
    const localAppData = process.env.LOCALAPPDATA;
    candidates.push(
      { command: "python.exe", prefixArguments: [], source: "system", displayName: "系统 Python" },
      { command: "python3.exe", prefixArguments: [], source: "system", displayName: "系统 Python 3" },
      { command: "py.exe", prefixArguments: ["-3"], source: "system", displayName: "Python Launcher" },
      { command: join(userHome, "anaconda3", "python.exe"), prefixArguments: [], source: "system", displayName: "Anaconda Python" },
      { command: join(userHome, "miniconda3", "python.exe"), prefixArguments: [], source: "system", displayName: "Miniconda Python" },
    );
    if (localAppData) {
      for (const version of ["313", "312", "311", "310"]) {
        candidates.push({
          command: join(localAppData, "Programs", "Python", `Python${version}`, "python.exe"),
          prefixArguments: [],
          source: "system",
          displayName: `Python ${version[0]}.${version.slice(1)}`,
        });
      }
    }
  } else {
    candidates.push(
      { command: "python3", prefixArguments: [], source: "system", displayName: "系统 Python 3" },
      { command: "python", prefixArguments: [], source: "system", displayName: "系统 Python" },
      { command: join(homedir(), "miniconda3", "bin", "python3"), prefixArguments: [], source: "system", displayName: "Miniconda Python" },
    );
  }
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.command}\0${candidate.prefixArguments.join("\0")}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function terminateProcessTree(child: ChildProcessWithoutNullStreams): void {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      timeout: 2_000,
      stdio: "ignore",
    });
    if (child.exitCode === null) child.kill();
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

function missingRuntime(message = "未找到可用的 Python 3 运行时"): AlgorithmRuntimeInfo {
  return {
    available: false,
    source: "missing",
    displayName: "Python 不可用",
    message,
  };
}

export class PythonAlgorithmRunner implements PythonAlgorithmRunnerPort {
  private readonly timeoutMs: number;
  private readonly outputLimitBytes: number;
  private readonly candidates: RuntimeCandidate[];
  private readonly active = new Set<ChildProcessWithoutNullStreams>();
  private runtimeTask?: Promise<ResolvedRuntime | undefined>;
  private closed = false;

  constructor(private readonly options: PythonAlgorithmRunnerOptions) {
    this.timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
    this.outputLimitBytes = positiveInteger(options.outputLimitBytes, DEFAULT_OUTPUT_LIMIT_BYTES);
    this.candidates = options.runtimeCandidates
      ? [...options.runtimeCandidates]
      : defaultCandidates(options.resourceDirectory, options.configuredPythonPath);
  }

  async getRuntimeInfo(): Promise<AlgorithmRuntimeInfo> {
    const runtime = await this.resolveRuntime();
    if (!runtime) return missingRuntime();
    return {
      available: true,
      source: runtime.source,
      displayName: runtime.displayName,
      version: runtime.version,
    };
  }

  async run(request: { slug: string; mode: AlgorithmMode; code: string }): Promise<AlgorithmExecutionResult> {
    if (this.closed) return this.failure("internal_error", "算法评测服务已关闭");
    const runtime = await this.resolveRuntime();
    if (!runtime) return this.failure("runtime_unavailable", "未找到可用的 Python 3 运行时");
    const bridge = join(this.options.resourceDirectory, "desktop_bridge.py");
    if (!existsSync(bridge)) return this.failure("internal_error", "算法评测组件不完整");

    const temporaryDirectory = await mkdtemp(join(tmpdir(), "pi-algorithm-"));
    try {
      return await this.execute(runtime, bridge, temporaryDirectory, request);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const child of this.active) terminateProcessTree(child);
    this.active.clear();
  }

  private resolveRuntime(): Promise<ResolvedRuntime | undefined> {
    this.runtimeTask ??= this.discoverRuntime();
    return this.runtimeTask;
  }

  private async discoverRuntime(): Promise<ResolvedRuntime | undefined> {
    for (const candidate of this.candidates) {
      // Skip missing absolute paths without paying a process-spawn penalty.
      if ((candidate.command.includes("/") || candidate.command.includes("\\")) && !existsSync(candidate.command)) continue;
      const version = await this.probe(candidate);
      if (version) return { ...candidate, version };
    }
    return undefined;
  }

  private probe(candidate: RuntimeCandidate): Promise<string | undefined> {
    return new Promise((resolve) => {
      let settled = false;
      let output = "";
      const child = spawn(candidate.command, [
        ...candidate.prefixArguments,
        "-I",
        "-B",
        "-c",
        "import sys; print('.'.join(map(str, sys.version_info[:3])))",
      ], {
        cwd: tmpdir(),
        env: minimalEnvironment(),
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const finish = (value?: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      };
      const timeout = setTimeout(() => {
        child.kill();
        finish();
      }, PROBE_TIMEOUT_MS);
      child.stdout.on("data", (chunk: Buffer) => {
        if (output.length < 256) output += chunk.toString("utf8");
      });
      child.once("error", () => finish());
      child.once("close", (code) => {
        const version = output.trim();
        finish(code === 0 && /^3\.\d+\.\d+$/.test(version) ? version : undefined);
      });
    });
  }

  private execute(
    runtime: ResolvedRuntime,
    bridge: string,
    temporaryDirectory: string,
    request: { slug: string; mode: AlgorithmMode; code: string },
  ): Promise<AlgorithmExecutionResult> {
    return new Promise((resolve) => {
      let stdout = Buffer.alloc(0);
      let stderr = Buffer.alloc(0);
      let settled = false;
      let timedOut = false;
      let exceeded = false;
      const child = spawn(runtime.command, [
        ...runtime.prefixArguments,
        "-I",
        "-B",
        "-u",
        bridge,
      ], {
        cwd: temporaryDirectory,
        env: minimalEnvironment(temporaryDirectory),
        windowsHide: true,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.active.add(child);

      const finish = (result: AlgorithmExecutionResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.active.delete(child);
        resolve(result);
      };
      const append = (target: "stdout" | "stderr", chunk: Buffer): void => {
        if (settled) return;
        if (stdout.length + stderr.length + chunk.length > this.outputLimitBytes) {
          exceeded = true;
          terminateProcessTree(child);
          return;
        }
        if (target === "stdout") stdout = Buffer.concat([stdout, chunk]);
        else stderr = Buffer.concat([stderr, chunk]);
      };
      const timeout = setTimeout(() => {
        timedOut = true;
        terminateProcessTree(child);
      }, this.timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
      child.once("error", (error) => finish(this.failure("internal_error", `无法启动 Python: ${error.message}`)));
      child.once("close", (code) => {
        if (timedOut) {
          finish(this.failure("time_limit_exceeded", `执行超过 ${Math.round(this.timeoutMs / 1_000)} 秒限制`));
          return;
        }
        if (exceeded) {
          finish(this.failure("output_limit_exceeded", `评测输出超过 ${Math.round(this.outputLimitBytes / 1024)} KiB 限制`));
          return;
        }
        finish(this.parseBridgeResult(stdout.toString("utf8"), stderr.toString("utf8"), code));
      });

      child.stdin.once("error", () => {
        // A crashing bridge may close stdin before the JSON write completes;
        // the close event above provides the useful diagnostic.
      });
      child.stdin.end(JSON.stringify(request), "utf8");
    });
  }

  private parseBridgeResult(stdout: string, stderr: string, exitCode: number | null): AlgorithmExecutionResult {
    let data: Record<string, unknown> | undefined;
    try {
      const parsed = JSON.parse(stdout) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
    } catch {
      // Handled below as an internal bridge failure.
    }
    if (!data) {
      return this.failure("internal_error", truncate(stderr.trim() || `Python 评测器返回了无效数据（退出码 ${exitCode ?? "?"}）`));
    }
    if (typeof data.fatal === "string") return this.failure("runtime_error", truncate(data.fatal));
    if (!Array.isArray(data.details) || !Number.isFinite(data.passed) || !Number.isFinite(data.total)) {
      return this.failure("internal_error", "Python 评测器返回数据不完整");
    }
    const cases: AlgorithmCaseResult[] = data.details.slice(0, 2_000).map((entry, index) => {
      const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      return {
        index: Number.isSafeInteger(row.index) ? Number(row.index) : index + 1,
        ok: row.ok === true,
        input: truncate(row.input),
        expected: truncate(row.expected),
        actual: truncate(row.actual),
        ...(row.error ? { error: truncate(row.error) } : {}),
        timeMs: typeof row.time_ms === "number" && Number.isFinite(row.time_ms) ? Math.max(0, row.time_ms) : 0,
      };
    });
    const kinds = new Set(data.details.map((entry) => (
      entry && typeof entry === "object" ? (entry as Record<string, unknown>).kind : undefined
    )));
    const passed = Math.max(0, Math.trunc(Number(data.passed)));
    const total = Math.max(0, Math.trunc(Number(data.total)));
    let verdict: AlgorithmVerdict;
    if (kinds.has("output_limit_exceeded")) verdict = "output_limit_exceeded";
    else if (kinds.has("time_limit_exceeded")) verdict = "time_limit_exceeded";
    else if (cases.some((item) => item.error)) verdict = "runtime_error";
    else if (total > 0 && passed === total) verdict = "accepted";
    else verdict = "wrong_answer";
    const firstError = cases.find((item) => item.error)?.error;
    return {
      verdict,
      passed,
      total,
      durationMs: typeof data.duration_ms === "number" && Number.isFinite(data.duration_ms)
        ? Math.max(0, data.duration_ms)
        : cases.reduce((sum, item) => sum + item.timeMs, 0),
      cases,
      ...(firstError ? { error: firstError } : {}),
    };
  }

  private failure(verdict: AlgorithmVerdict, error: string): AlgorithmExecutionResult {
    return {
      verdict,
      passed: 0,
      total: 0,
      durationMs: 0,
      cases: [],
      error,
    };
  }
}

export type { AlgorithmExecutionResult, RuntimeCandidate as PythonRuntimeCandidate };
