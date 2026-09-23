import { describe, expect, it, vi } from "vitest";
import type { RendererWindow } from "../send-to-renderer";
import {
  KnowledgeStudioMainModule,
  type KnowledgeStudioMainModuleOptions,
  type KnowledgeStudioServicePort,
} from "./knowledge-studio-main-module";

type Handler = (event: unknown, ...args: unknown[]) => unknown;

function createIpcMain(failChannel?: string) {
  const handlers = new Map<string, Handler>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: Handler) => {
      if (channel === failChannel) throw new Error("registration failed");
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
  } as unknown as KnowledgeStudioMainModuleOptions["ipcMain"];
  return { ipcMain, handlers };
}

function service(): KnowledgeStudioServicePort {
  return {
    getSnapshot: vi.fn(() => ({ sourceCount: 0, candidateCount: 0, publishedCount: 0, sources: [], batches: [] })),
    getModelInfo: vi.fn(async () => ({ configured: true, providerId: "test-provider", modelId: "test-model", availableModels: [] })),
    previewBatch: vi.fn(async () => ({} as never)),
    getSource: vi.fn(() => null),
    getSourceOriginal: vi.fn(async () => null),
    importText: vi.fn(async () => ({} as never)),
    importFiles: vi.fn(async () => ({ sources: [], failures: [] })),
    importUrl: vi.fn(async () => ({} as never)),
    deleteSource: vi.fn(async () => ({ deleted: true, deletedBatchCount: 0, deletedArtifactCount: 0 })),
    createBatch: vi.fn(async (_request: unknown, progress) => {
      progress?.({ batchId: "batch-1", status: "running", stage: "answering", progress: 50, message: "生成答案" });
      return {} as never;
    }),
    retryBatch: vi.fn(async () => ({} as never)),
    cancelBatch: vi.fn(() => ({} as never)),
    deleteBatch: vi.fn(async () => ({ deleted: true, deletedArtifactCount: 0 })),
    getBatch: vi.fn(() => null),
    reviewCandidate: vi.fn(() => ({} as never)),
    publishBatch: vi.fn(async () => ({} as never)),
    revealArtifact: vi.fn(),
    close: vi.fn(async () => undefined),
  };
}

describe("KnowledgeStudioMainModule", () => {
  it("owns its IPC surface and forwards generation progress", async () => {
    const { ipcMain, handlers } = createIpcMain();
    const instance = service();
    const send = vi.fn();
    const window: RendererWindow = { isDestroyed: () => false, webContents: { isDestroyed: () => false, send } };
    const module = new KnowledgeStudioMainModule({
      dataDirectory: "C:/data/knowledge-studio",
      ipcMain,
      getWindow: () => window,
      selectFiles: async () => [],
      revealPath: () => undefined,
      createService: () => instance,
    });

    module.start();
    expect(handlers.size).toBe(17);
    await handlers.get("knowledge-studio:preview-batch")?.({}, { title: "preview" });
    expect(instance.previewBatch).toHaveBeenCalledWith({ title: "preview" });
    await handlers.get("knowledge-studio:delete-source")?.({}, "source-a", true);
    expect(instance.deleteSource).toHaveBeenCalledWith("source-a", true);
    await handlers.get("knowledge-studio:create-batch")?.({}, { title: "batch" });
    expect(send).toHaveBeenCalledWith("knowledge-studio:generation-progress", {
      batchId: "batch-1", status: "running", stage: "answering", progress: 50, message: "生成答案",
    });

    await module.dispose();
    expect(handlers.size).toBe(0);
    expect(instance.close).toHaveBeenCalledOnce();
  });

  it("rolls back handlers when registration fails", () => {
    const { ipcMain, handlers } = createIpcMain("knowledge-studio:import-url");
    const instance = service();
    const module = new KnowledgeStudioMainModule({
      dataDirectory: "C:/data/knowledge-studio",
      ipcMain,
      getWindow: () => null,
      selectFiles: async () => [],
      revealPath: () => undefined,
      createService: () => instance,
    });

    expect(() => module.start()).toThrow("registration failed");
    expect(handlers.size).toBe(0);
    expect(instance.close).toHaveBeenCalledOnce();
  });
});
