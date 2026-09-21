import type { IpcMain } from "electron";
import type { ProductModuleId } from "../../platform/shared/product-module";
import type { ModelGateway } from "../../platform/shared/ai/model-gateway";
import {
  INTERVIEW_IPC,
  type InterviewPreparationProgress,
  type JobCollectionProgress,
} from "../../shared/contracts/interview";
import type { MainModule } from "../../platform/main/main-module-host";
import { sendToRenderer, type RendererWindow } from "../send-to-renderer";
import { InterviewService } from "./interview-service";
import { GatewayInterviewModelProvider } from "./interview-model-provider";
import { ElectronJobCollector } from "./job-collector";

const INTERVIEW_IPC_CHANNELS = [
  INTERVIEW_IPC.getSnapshot,
  INTERVIEW_IPC.getInterview,
  INTERVIEW_IPC.getInterviewSession,
  INTERVIEW_IPC.createInterview,
  INTERVIEW_IPC.prepareInterview,
  INTERVIEW_IPC.getJobLibrary,
  INTERVIEW_IPC.collectJobs,
] as const;

type InterviewIpcChannel = (typeof INTERVIEW_IPC_CHANNELS)[number];

export type InterviewIpcMain = Pick<IpcMain, "handle" | "removeHandler">;

export type InterviewServicePort = Pick<
  InterviewService,
  "getSnapshot" | "getInterview" | "getInterviewSession" | "createInterview" | "prepareInterview"
  | "getJobLibrary" | "collectJobs" | "close"
>;

export type InterviewMainModuleOptions = {
  dataDirectory: string;
  ipcMain: InterviewIpcMain;
  getWindow: () => RendererWindow | null;
  modelGateway?: ModelGateway;
  createService?: (dataDirectory: string) => InterviewServicePort;
};

/**
 * Owns the complete main-process lifecycle of the interview business module.
 *
 * Keeping construction, IPC registration and disposal together makes the
 * module independently testable and prevents the application entry point from
 * accumulating interview-specific behavior as the product grows.
 */
export class InterviewMainModule implements MainModule {
  readonly id = "interview" satisfies ProductModuleId;
  private service?: InterviewServicePort;
  private registered = false;
  private startTask?: Promise<void>;
  private disposeTask?: Promise<void>;

  constructor(private readonly options: InterviewMainModuleOptions) {}

  start(): Promise<void> {
    if (this.startTask) return this.startTask;
    this.startTask = this.startModule().catch((error: unknown) => {
      this.startTask = undefined;
      throw error;
    });
    return this.startTask;
  }

  private async startModule(): Promise<void> {
    if (this.service) return;

    const createService = this.options.createService ?? ((dataDirectory: string) => new InterviewService(
      dataDirectory,
      undefined,
      new ElectronJobCollector(),
      this.options.modelGateway ? new GatewayInterviewModelProvider(this.options.modelGateway) : undefined,
    ));
    this.service = createService(this.options.dataDirectory);

    try {
      this.registerIpc();
    } catch (error) {
      const service = this.service;
      this.service = undefined;
      try {
        await service.close();
      } catch (closeError) {
        throw new AggregateError([error, closeError], "智能面试模块启动回滚失败");
      }
      throw error;
    }
  }

  registerIpc(): void {
    if (this.registered) return;
    const service = this.service;
    if (!service) throw new Error("智能面试模块尚未启动");

    const registeredChannels: InterviewIpcChannel[] = [];
    const handle = (channel: InterviewIpcChannel, listener: Parameters<IpcMain["handle"]>[1]): void => {
      this.options.ipcMain.handle(channel, listener);
      registeredChannels.push(channel);
    };

    try {
      handle(INTERVIEW_IPC.getSnapshot, () => service.getSnapshot());
      handle(INTERVIEW_IPC.getInterview, (_event, id: unknown) => service.getInterview(id));
      handle(INTERVIEW_IPC.getInterviewSession, (_event, id: unknown) => service.getInterviewSession(id));
      handle(INTERVIEW_IPC.createInterview, (_event, request: unknown) => service.createInterview(request));
      handle(INTERVIEW_IPC.prepareInterview, (_event, request: unknown) => service.prepareInterview(
        request,
        (progress) => this.sendPreparationProgress(progress),
      ));
      handle(INTERVIEW_IPC.getJobLibrary, () => service.getJobLibrary());
      handle(INTERVIEW_IPC.collectJobs, (_event, request: unknown) => service.collectJobs(
        request,
        (progress) => this.sendJobProgress(progress),
      ));
      this.registered = true;
    } catch (error) {
      for (const channel of registeredChannels.reverse()) this.options.ipcMain.removeHandler(channel);
      throw error;
    }
  }

  dispose(): Promise<void> {
    this.disposeTask ??= this.disposeModule();
    return this.disposeTask;
  }

  private async disposeModule(): Promise<void> {
    if (this.registered) {
      for (const channel of INTERVIEW_IPC_CHANNELS) this.options.ipcMain.removeHandler(channel);
      this.registered = false;
    }

    const service = this.service;
    this.service = undefined;
    await service?.close();
  }

  private sendJobProgress(progress: JobCollectionProgress): void {
    sendToRenderer(this.options.getWindow(), INTERVIEW_IPC.jobCollectionProgress, progress);
  }

  private sendPreparationProgress(progress: InterviewPreparationProgress): void {
    sendToRenderer(this.options.getWindow(), INTERVIEW_IPC.preparationProgress, progress);
  }
}
