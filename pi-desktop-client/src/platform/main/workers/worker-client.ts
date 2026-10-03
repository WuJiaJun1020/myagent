import type { Worker } from "node:worker_threads";

export type WorkerMethods = Record<string, { input: object; output: unknown }>;
export type WorkerRequest<M extends WorkerMethods> = {
  [K in keyof M]: { request: number; action: K } & M[K]["input"];
}[keyof M];
export type WorkerReply = { request: number; value?: unknown; error?: string };
type Endpoint = Pick<Worker, "on" | "postMessage" | "terminate">;
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; cleanup: () => void };

/** Lazy transport. Stop a failed worker before a replacement can write. */
export class WorkerClient<M extends WorkerMethods> {
  private worker?: Endpoint;
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private closing: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private terminationError?: Error;

  constructor(private create: () => Endpoint, private name: string, private timeoutMs = 120_000) {}
  get started() { return !!this.worker; }

  async request<K extends keyof M>(action: K, input: M[K]["input"], options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<M[K]["output"]> {
    await this.closing;
    if (this.disposed) throw Error(`${this.name}已关闭`);
    if (this.terminationError) throw this.terminationError;
    options.signal?.throwIfAborted();
    const worker = this.worker ?? this.open();
    const request = ++this.sequence;
    return new Promise<M[K]["output"]>((resolve, reject) => {
      const abort = () => this.fail(worker, Error(`${this.name}请求已取消`));
      const timer = setTimeout(() => this.fail(worker, Error(`${this.name}请求超时，服务已中断，请重试`)), options.timeoutMs ?? this.timeoutMs);
      const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); };
      // The only response cast is at the transport boundary.
      this.pending.set(request, { resolve: value => resolve(value as M[K]["output"]), reject, cleanup });
      options.signal?.addEventListener("abort", abort, { once: true });
      try { worker.postMessage({ ...input, request, action }); }
      catch (error) { this.fail(worker, error instanceof Error ? error : Error(String(error))); }
    });
  }

  private open() {
    const worker = this.worker = this.create();
    worker.on("message", (message: unknown) => {
      if (this.worker !== worker || !message || typeof message !== "object") return;
      const reply = message as Partial<WorkerReply>;
      if (!Number.isSafeInteger(reply.request)) return;
      const pending = this.pending.get(reply.request!);
      if (!pending) return;
      this.pending.delete(reply.request!); pending.cleanup();
      if (typeof reply.error === "string") pending.reject(Error(reply.error));
      else if ("value" in reply) pending.resolve(reply.value);
      else pending.reject(Error(`${this.name}响应格式无效`));
    });
    worker.on("error", error => this.fail(worker, Error(`${this.name}已中断：${error.message}`)));
    worker.on("exit", () => this.fail(worker, Error(`${this.name}已退出，请重试`)));
    return worker;
  }

  private fail(worker: Endpoint, error: Error) {
    if (this.worker !== worker) return;
    this.worker = undefined;
    // Do not retry mutations or overlap workers, even while termination is pending.
    this.closing = worker.terminate().catch(() => { this.terminationError = Error(`${this.name}旧进程未能结束，请重启客户端后重试`); });
    for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(error); }
    this.pending.clear();
  }

  async dispose() {
    this.disposed = true;
    if (this.worker) this.fail(this.worker, Error(`${this.name}已关闭`));
    await this.closing;
  }
}
