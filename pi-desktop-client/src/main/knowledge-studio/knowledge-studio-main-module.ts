import type { IpcMain } from "electron";
import type { ModelGateway } from "../../platform/shared/ai/model-gateway";
import type { MainModule } from "../../platform/main/main-module-host";
import type { ProductModuleId } from "../../platform/shared/product-module";
import { KNOWLEDGE_STUDIO_IPC, type KnowledgeGenerationProgress } from "../../shared/contracts/knowledge-studio";
import { sendToRenderer, type RendererWindow } from "../send-to-renderer";
import { KnowledgeGenerationWorkflow } from "./knowledge-model-provider";
import { KnowledgeStudioService } from "./knowledge-studio-service";

const CHANNELS = [
  KNOWLEDGE_STUDIO_IPC.getSnapshot,
  KNOWLEDGE_STUDIO_IPC.getModelInfo,
  KNOWLEDGE_STUDIO_IPC.previewBatch,
  KNOWLEDGE_STUDIO_IPC.getSource,
  KNOWLEDGE_STUDIO_IPC.getSourceOriginal,
  KNOWLEDGE_STUDIO_IPC.importText,
  KNOWLEDGE_STUDIO_IPC.importFiles,
  KNOWLEDGE_STUDIO_IPC.importUrl,
  KNOWLEDGE_STUDIO_IPC.deleteSource,
  KNOWLEDGE_STUDIO_IPC.createBatch,
  KNOWLEDGE_STUDIO_IPC.retryBatch,
  KNOWLEDGE_STUDIO_IPC.cancelBatch,
  KNOWLEDGE_STUDIO_IPC.deleteBatch,
  KNOWLEDGE_STUDIO_IPC.getBatch,
  KNOWLEDGE_STUDIO_IPC.reviewCandidate,
  KNOWLEDGE_STUDIO_IPC.publishBatch,
  KNOWLEDGE_STUDIO_IPC.revealArtifact,
] as const;

type Channel = (typeof CHANNELS)[number];

export type KnowledgeStudioServicePort = Pick<KnowledgeStudioService,
  "getSnapshot" | "getModelInfo" | "previewBatch" | "getSource" | "getSourceOriginal" | "importText" | "importFiles" | "importUrl" | "deleteSource"
  | "createBatch" | "retryBatch" | "cancelBatch" | "deleteBatch" | "getBatch" | "reviewCandidate"
  | "publishBatch" | "revealArtifact" | "close"
>;

export type KnowledgeStudioMainModuleOptions = {
  dataDirectory: string;
  ipcMain: Pick<IpcMain, "handle" | "removeHandler">;
  getWindow: () => RendererWindow | null;
  modelGateway?: ModelGateway;
  selectFiles: () => Promise<string[]>;
  revealPath: (path: string) => void;
  captureWebPage?: (url: string, targetPath: string) => Promise<void>;
  createService?: () => KnowledgeStudioServicePort;
};

export class KnowledgeStudioMainModule implements MainModule {
  readonly id = "knowledge-studio" satisfies ProductModuleId;
  private service?: KnowledgeStudioServicePort;
  private registered = false;

  constructor(private readonly options: KnowledgeStudioMainModuleOptions) {}

  start(): void {
    if (this.service) return;
    this.service = this.options.createService?.() ?? new KnowledgeStudioService({
      dataDirectory: this.options.dataDirectory,
      workflow: this.options.modelGateway ? new KnowledgeGenerationWorkflow(this.options.modelGateway) : undefined,
      resolveModel: this.options.modelGateway?.getConfiguredModel
        ? () => this.options.modelGateway!.getConfiguredModel!()
        : undefined,
      listModels: this.options.modelGateway?.getAvailableModels
        ? () => this.options.modelGateway!.getAvailableModels!()
        : undefined,
      selectFiles: this.options.selectFiles,
      revealPath: this.options.revealPath,
      captureWebPage: this.options.captureWebPage,
    });
    try {
      this.registerIpc();
    } catch (error) {
      void this.service.close();
      this.service = undefined;
      throw error;
    }
  }

  async dispose(): Promise<void> {
    if (this.registered) {
      for (const channel of CHANNELS) this.options.ipcMain.removeHandler(channel);
      this.registered = false;
    }
    const service = this.service;
    this.service = undefined;
    await service?.close();
  }

  private registerIpc(): void {
    if (this.registered) return;
    const service = this.service;
    if (!service) throw new Error("知识工坊模块尚未启动");
    const registered: Channel[] = [];
    const handle = (channel: Channel, listener: Parameters<IpcMain["handle"]>[1]) => {
      this.options.ipcMain.handle(channel, listener);
      registered.push(channel);
    };
    const progress = (value: KnowledgeGenerationProgress) => {
      sendToRenderer(this.options.getWindow(), KNOWLEDGE_STUDIO_IPC.generationProgress, value);
    };
    try {
      handle(KNOWLEDGE_STUDIO_IPC.getSnapshot, () => service.getSnapshot());
      handle(KNOWLEDGE_STUDIO_IPC.getModelInfo, () => service.getModelInfo());
      handle(KNOWLEDGE_STUDIO_IPC.previewBatch, (_event, request: unknown) => service.previewBatch(request));
      handle(KNOWLEDGE_STUDIO_IPC.getSource, (_event, id: unknown) => service.getSource(id));
      handle(KNOWLEDGE_STUDIO_IPC.getSourceOriginal, (_event, id: unknown) => service.getSourceOriginal(id));
      handle(KNOWLEDGE_STUDIO_IPC.importText, (_event, request: unknown) => service.importText(request));
      handle(KNOWLEDGE_STUDIO_IPC.importFiles, () => service.importFiles());
      handle(KNOWLEDGE_STUDIO_IPC.importUrl, (_event, request: unknown) => service.importUrl(request));
      handle(KNOWLEDGE_STUDIO_IPC.deleteSource, (_event, id: unknown, deleteReferencingBatches: unknown) => service.deleteSource(id, deleteReferencingBatches));
      handle(KNOWLEDGE_STUDIO_IPC.createBatch, (_event, request: unknown) => service.createBatch(request, progress));
      handle(KNOWLEDGE_STUDIO_IPC.retryBatch, (_event, id: unknown) => service.retryBatch(id, progress));
      handle(KNOWLEDGE_STUDIO_IPC.cancelBatch, (_event, id: unknown) => service.cancelBatch(id));
      handle(KNOWLEDGE_STUDIO_IPC.deleteBatch, (_event, id: unknown) => service.deleteBatch(id));
      handle(KNOWLEDGE_STUDIO_IPC.getBatch, (_event, id: unknown) => service.getBatch(id));
      handle(KNOWLEDGE_STUDIO_IPC.reviewCandidate, (_event, request: unknown) => service.reviewCandidate(request));
      handle(KNOWLEDGE_STUDIO_IPC.publishBatch, (_event, id: unknown) => service.publishBatch(id));
      handle(KNOWLEDGE_STUDIO_IPC.revealArtifact, (_event, path: unknown) => service.revealArtifact(path));
      this.registered = true;
    } catch (error) {
      for (const channel of registered) this.options.ipcMain.removeHandler(channel);
      throw error;
    }
  }
}
