import type { IpcMain } from "electron";
import { ALGORITHM_PRACTICE_IPC } from "../../shared/contracts/algorithm-practice";
import type { MainModule } from "../../platform/main/main-module-host";
import {
  AlgorithmPracticeService,
  type AlgorithmPracticeServicePort,
} from "./algorithm-practice-service";

const CHANNELS = [
  ALGORITHM_PRACTICE_IPC.getSnapshot,
  ALGORITHM_PRACTICE_IPC.getProblem,
  ALGORITHM_PRACTICE_IPC.saveDraft,
  ALGORITHM_PRACTICE_IPC.resetDraft,
  ALGORITHM_PRACTICE_IPC.run,
] as const;

type Channel = (typeof CHANNELS)[number];

export type AlgorithmPracticeIpcMain = Pick<IpcMain, "handle" | "removeHandler">;

export type AlgorithmPracticeMainModuleOptions = {
  dataDirectory: string;
  resourceDirectory: string;
  ipcMain: AlgorithmPracticeIpcMain;
  configuredPythonPath?: string;
  createService?: (options: {
    dataDirectory: string;
    resourceDirectory: string;
    configuredPythonPath?: string;
  }) => AlgorithmPracticeServicePort;
};

/** Independent lifecycle boundary for the local algorithm judge. */
export class AlgorithmPracticeMainModule implements MainModule {
  readonly id = "algorithm-practice";
  private service?: AlgorithmPracticeServicePort;
  private registered = false;
  private startTask?: Promise<void>;
  private disposeTask?: Promise<void>;

  constructor(private readonly options: AlgorithmPracticeMainModuleOptions) {}

  start(): Promise<void> {
    if (this.startTask) return this.startTask;
    this.startTask = this.startModule().catch((error: unknown) => {
      this.startTask = undefined;
      throw error;
    });
    return this.startTask;
  }

  registerIpc(): void {
    if (this.registered) return;
    const service = this.service;
    if (!service) throw new Error("算法练习模块尚未启动");
    const registered: Channel[] = [];
    const handle = (channel: Channel, listener: Parameters<IpcMain["handle"]>[1]): void => {
      this.options.ipcMain.handle(channel, listener);
      registered.push(channel);
    };
    try {
      handle(ALGORITHM_PRACTICE_IPC.getSnapshot, () => service.getSnapshot());
      handle(ALGORITHM_PRACTICE_IPC.getProblem, (_event, slug: unknown) => service.getProblem(slug));
      handle(ALGORITHM_PRACTICE_IPC.saveDraft, (_event, request: unknown) => service.saveDraft(request));
      handle(ALGORITHM_PRACTICE_IPC.resetDraft, (_event, request: unknown) => service.resetDraft(request));
      handle(ALGORITHM_PRACTICE_IPC.run, (_event, request: unknown) => service.run(request));
      this.registered = true;
    } catch (error) {
      for (const channel of registered.reverse()) this.options.ipcMain.removeHandler(channel);
      throw error;
    }
  }

  dispose(): Promise<void> {
    this.disposeTask ??= this.disposeModule();
    return this.disposeTask;
  }

  private async startModule(): Promise<void> {
    if (this.service) return;
    const serviceOptions = {
      dataDirectory: this.options.dataDirectory,
      resourceDirectory: this.options.resourceDirectory,
      ...(this.options.configuredPythonPath ? { configuredPythonPath: this.options.configuredPythonPath } : {}),
    };
    const createService = this.options.createService ?? ((options: typeof serviceOptions) => (
      new AlgorithmPracticeService(options)
    ));
    this.service = createService(serviceOptions);
    try {
      this.registerIpc();
    } catch (error) {
      const service = this.service;
      this.service = undefined;
      try {
        await service.close();
      } catch (closeError) {
        throw new AggregateError([error, closeError], "算法练习模块启动回滚失败");
      }
      throw error;
    }
  }

  private async disposeModule(): Promise<void> {
    if (this.registered) {
      for (const channel of CHANNELS) this.options.ipcMain.removeHandler(channel);
      this.registered = false;
    }
    const service = this.service;
    this.service = undefined;
    await service?.close();
  }
}
