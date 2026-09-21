export interface MainModule {
  readonly id: string;
  start(context?: MainModuleStartContext): Promise<void> | void;
  dispose(): Promise<void> | void;
}

export type MainModuleStartContext = {
  signal: AbortSignal;
};

export type MainModuleHostOptions = {
  startTimeoutMs?: number;
  disposeTimeoutMs?: number;
};

export type MainModuleStartFailure = {
  moduleId: string;
  error: unknown;
};

type HostState = "idle" | "starting" | "started" | "disposing" | "disposed";

type StartedModule = {
  module: MainModule;
  controller: AbortController;
};

const DEFAULT_START_TIMEOUT_MS = 15_000;
const DEFAULT_DISPOSE_TIMEOUT_MS = 10_000;

function positiveTimeout(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Minimal lifecycle host for compile-time product modules.
 *
 * Product modules are fault-isolated: one corrupt or unavailable module must
 * not prevent the desktop shell and the other modules from starting.
 */
export class MainModuleHost {
  private readonly modules: MainModule[] = [];
  private readonly startedModules: StartedModule[] = [];
  private readonly startFailures: MainModuleStartFailure[] = [];
  private readonly startTimeoutMs: number;
  private readonly disposeTimeoutMs: number;
  private state: HostState = "idle";
  private startTask?: Promise<readonly MainModuleStartFailure[]>;
  private disposeTask?: Promise<void>;

  constructor(options: MainModuleHostOptions = {}) {
    this.startTimeoutMs = positiveTimeout(options.startTimeoutMs, DEFAULT_START_TIMEOUT_MS);
    this.disposeTimeoutMs = positiveTimeout(options.disposeTimeoutMs, DEFAULT_DISPOSE_TIMEOUT_MS);
  }

  register(module: MainModule): void {
    if (this.state !== "idle" || this.startTask) throw new Error("主进程模块已开始启动，不能再注册");
    if (!module.id.trim()) throw new Error("主进程模块 ID 不能为空");
    if (this.modules.some((candidate) => candidate.id === module.id)) {
      throw new Error(`主进程模块 ${module.id} 已注册`);
    }
    this.modules.push(module);
  }

  start(): Promise<readonly MainModuleStartFailure[]> {
    if (this.state === "started") return Promise.resolve([...this.startFailures]);
    if (this.state === "starting" && this.startTask) return this.startTask;
    if (this.state === "disposing" || this.state === "disposed") {
      return Promise.reject(new Error("主进程模块宿主已释放"));
    }

    this.state = "starting";
    const task = this.startAll();
    this.startTask = task;
    return task;
  }

  dispose(): Promise<void> {
    if (this.state === "disposed") return Promise.resolve();
    if (this.state === "disposing" && this.disposeTask) return this.disposeTask;

    const task = this.disposeAll();
    this.disposeTask = task;
    return task;
  }

  private async startAll(): Promise<readonly MainModuleStartFailure[]> {
    for (const module of this.modules) {
      const controller = new AbortController();
      try {
        await this.withDeadline(
          () => module.start({ signal: controller.signal }),
          this.startTimeoutMs,
          `启动业务模块 ${module.id}`,
        );
        this.startedModules.push({ module, controller });
      } catch (error) {
        controller.abort(error);
        let isolatedError: unknown = error;
        try {
          // A module may have allocated resources before its start failed.
          // dispose must therefore remain safe after partial startup.
          await this.withDeadline(
            () => module.dispose(),
            this.disposeTimeoutMs,
            `隔离业务模块 ${module.id}`,
          );
        } catch (disposeError) {
          isolatedError = new AggregateError([error, disposeError], `隔离模块 ${module.id} 时释放失败`);
        }
        this.startFailures.push({ moduleId: module.id, error: isolatedError });
      }
    }
    this.state = "started";
    return [...this.startFailures];
  }

  private async disposeAll(): Promise<void> {
    if (this.state === "starting" && this.startTask) {
      try {
        await this.startTask;
      } catch {
        // Individual module failures are normally captured in startFailures;
        // this guard only keeps disposal safe after an unexpected host failure.
      }
    }

    this.state = "disposing";
    const errors = await this.disposeStartedModules();
    this.state = "disposed";
    if (errors.length > 0) throw new AggregateError(errors, "释放主进程模块时发生错误");
  }

  private async disposeStartedModules(): Promise<unknown[]> {
    const errors: unknown[] = [];
    for (const { module, controller } of this.startedModules.splice(0).reverse()) {
      controller.abort(new Error(`业务模块 ${module.id} 正在关闭`));
      try {
        await this.withDeadline(
          () => module.dispose(),
          this.disposeTimeoutMs,
          `释放业务模块 ${module.id}`,
        );
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }

  private withDeadline<T>(operation: () => Promise<T> | T, timeoutMs: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`${label}超时（${timeoutMs}ms）`));
      }, timeoutMs);

      Promise.resolve()
        .then(operation)
        .then((value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(value);
        }, (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error);
        });
    });
  }
}
