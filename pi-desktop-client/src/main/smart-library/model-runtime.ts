import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { createServer } from "node:net";
import type { LibraryLocalModels, LibraryRuntimeStatus } from "../../shared/contracts/smart-library";
import { resolveLibraryModelPaths, type LibraryRuntimeLocations } from "../../platform/main/runtime/library-model-paths.mjs";

export class LibraryModelRuntime {
  private child?: ChildProcess;
  private lock = false;
  private closing = false;
  private error = "";
  private output = "";
  private timer?: ReturnType<typeof setTimeout>;
  private started = 0;
  private stoppingRequested = false;
  private startOperation?: Promise<LibraryRuntimeStatus>;
  private disposed = false;
  isStopping() { return this.stoppingRequested || this.closing; }
  constructor(private appRoot: string, private canStop: () => Promise<boolean>, private port = 18081,
    private locations: LibraryRuntimeLocations = { dataRoot: join(appRoot, ".cache", "library-service") }) {}
  private async health() {
    try {
      const r = await fetch(`http://127.0.0.1:${this.port}/health`, { signal: AbortSignal.timeout(1200), redirect: "error" });
      if (!r.ok) return null;
      const text = await r.text(); if (text.length > 16384) return null;
      const h = JSON.parse(text);
      return h.ready === true && Array.isArray(h.models) && h.models.includes("Qwen/Qwen3-Embedding-0.6B") ? h : null;
    } catch { return null; }
  }
  async status(): Promise<LibraryRuntimeStatus> {
    const h = await this.health();
    return { state: this.closing ? "stopping" : h ? "ready" : this.child ? "starting" : this.error ? "failed" : "stopped",
      owned: !!this.child, busy: !!h?.busy, gpu: typeof h?.gpu === "string" ? h.gpu : undefined,
      error: !h && this.error || undefined, log: !h && (this.error || this.child) ? this.output.slice(-2000) : undefined,
      elapsedSeconds: this.child ? Math.floor((Date.now() - this.started) / 1000) : undefined };
  }
  async ensure(settings: LibraryLocalModels): Promise<LibraryRuntimeStatus> {
    const managed = (address: string) => {
      const url = new URL(address);
      return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === String(this.port);
    };
    const embedding = managed(settings.embeddingUrl), reranker = managed(settings.rerankerUrl);
    if (!embedding && !reranker) return { state: "stopped", owned: false, busy: false, managedRequired: false,
      notice: "当前使用自定义本地接口，请自行启动对应服务；客户端不会启动默认端口的服务。" };
    const status = await this.action("start");
    return { ...status, managedRequired: true, ...(!embedding || !reranker ? {
      notice: "默认端口的本地模型服务由客户端启动；自定义接口仍需自行启动。",
    } : {}) };
  }
  async action(action: "start" | "stop"): Promise<LibraryRuntimeStatus> {
    if (this.disposed) throw Error("客户端正在退出，无法启动模型服务");
    // All panels and the manual controls join the same startup operation.
    if (action === "stop") return this.performAction(action);
    if (this.startOperation) return this.startOperation;
    const operation = this.performAction(action);
    this.startOperation = operation;
    try { return await operation; }
    finally { if (this.startOperation === operation) this.startOperation = undefined; }
  }
  private async performAction(action: "start" | "stop"): Promise<LibraryRuntimeStatus> {
    if (this.lock) throw Error("模型服务正在处理上一项操作，请稍候");
    this.lock = true;
    this.stoppingRequested = action === "stop";
    try {
      if (action === "stop") {
        if (!this.child) throw Error("服务不是由本客户端启动，请在原来的终端停止");
        if (!(await this.canStop()) || (await this.health())?.busy) throw Error("模型测试或索引正在运行，请先暂停任务再停止服务");
        await this.stop();
      } else {
        if (this.child || await this.health()) return this.status();
        const paths = await resolveLibraryModelPaths({ appRoot: this.appRoot, ...this.locations });
        await new Promise<void>((resolve, reject) => {
          const server = createServer(); server.once("error", () => reject(Error(`端口 ${this.port} 已被占用，但未检测到就绪的图书模型服务；请检查原服务是否正在启动`)));
          server.listen(this.port, "127.0.0.1", () => server.close(() => resolve()));
        });
        if (this.disposed) throw Error("客户端正在退出，无法启动模型服务");
        this.error = ""; this.output = ""; this.started = Date.now();
        const child = this.child = spawn(paths.pythonExe, ["-u", paths.serverScript, "--port", String(this.port), "--exit-on-stdin-close"], {
          cwd: paths.workingDirectory, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, PYTHONIOENCODING: "utf-8", PI_LIBRARY_MODELS: paths.modelsDirectory },
        });
        const log = (chunk: Buffer) => { this.output = (this.output + chunk.toString("utf8")).slice(-8000); };
        child.stdout?.on("data", log); child.stderr?.on("data", log);
        child.stdin?.on("error", () => {});
        child.once("error", () => { this.error = "无法启动模型进程，请检查 Python 环境"; });
        child.once("close", code => {
          if (this.child !== child) return;
          this.child = undefined; clearTimeout(this.timer);
          if (!this.closing && !this.error) this.error = `模型服务意外退出（${code ?? "未知"}），请查看启动日志`;
        });
        this.timer = setTimeout(() => { void (async () => { if (this.child === child && !await this.health()) { this.error = "模型加载超过 3 分钟，已停止；请查看日志后重试"; await this.stop(); } })(); }, 180000);
      }
      return this.status();
    } catch (error) {
      if (action === "start") this.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally { this.lock = false; this.stoppingRequested = false; }
  }
  private async stop() {
    const child = this.child; if (!child) return;
    this.closing = true; clearTimeout(this.timer);
    try {
      await new Promise<void>(resolve => {
        const fallback = setTimeout(() => { child.kill(); }, 8000);
        child.once("close", () => { clearTimeout(fallback); resolve(); });
        // The Python watchdog exits on EOF, including when Electron crashes/restarts.
        child.stdin?.end();
      });
    } finally { this.closing = false; }
  }
  async dispose() { this.disposed = true; await this.startOperation?.catch(() => {}); await this.stop(); }
}
