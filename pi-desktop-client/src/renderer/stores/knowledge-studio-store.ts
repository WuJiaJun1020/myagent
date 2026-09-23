import { create } from "zustand";
import type {
  KnowledgeCreateBatchRequest,
  KnowledgeDeleteSourceRequest,
  KnowledgeGenerationBatch,
  KnowledgeGenerationProgress,
  KnowledgeImportTextRequest,
  KnowledgeImportUrlRequest,
  KnowledgeReviewCandidateRequest,
  KnowledgeSourceDetail,
  KnowledgeStudioModelInfo,
  KnowledgeStudioSnapshot,
} from "../../shared/contracts/knowledge-studio";
import { knowledgeStudioGateway } from "../services/knowledge-studio-gateway";

export type KnowledgeStudioTab = "sources" | "generate" | "review";

type KnowledgeStudioStore = {
  snapshot: KnowledgeStudioSnapshot | null;
  modelInfo: KnowledgeStudioModelInfo | null;
  selectedSourceId: string | null;
  sourceDetail: KnowledgeSourceDetail | null;
  selectedBatchId: string | null;
  batch: KnowledgeGenerationBatch | null;
  tab: KnowledgeStudioTab;
  initialized: boolean;
  loading: boolean;
  busy: boolean;
  error: string | null;
  importNotice: string | null;
  progress: KnowledgeGenerationProgress | null;
  initialize(force?: boolean): Promise<void>;
  setTab(tab: KnowledgeStudioTab): void;
  selectSource(id: string): Promise<void>;
  selectBatch(id: string): Promise<void>;
  importFiles(): Promise<void>;
  importText(request: KnowledgeImportTextRequest): Promise<void>;
  importUrl(request: KnowledgeImportUrlRequest): Promise<void>;
  deleteSource(request: KnowledgeDeleteSourceRequest): Promise<void>;
  createBatch(request: KnowledgeCreateBatchRequest): Promise<void>;
  retryBatch(id: string): Promise<void>;
  cancelBatch(id: string): Promise<void>;
  deleteBatch(id: string): Promise<void>;
  reviewCandidate(request: KnowledgeReviewCandidateRequest): Promise<void>;
  publishBatch(id: string): Promise<void>;
  revealArtifact(path: string): Promise<void>;
  applyProgress(progress: KnowledgeGenerationProgress): void;
  clearError(): void;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useKnowledgeStudioStore = create<KnowledgeStudioStore>((set, get) => ({
  snapshot: null,
  modelInfo: null,
  selectedSourceId: null,
  sourceDetail: null,
  selectedBatchId: null,
  batch: null,
  tab: "sources",
  initialized: false,
  loading: false,
  busy: false,
  error: null,
  importNotice: null,
  progress: null,

  initialize: async (force = false) => {
    if (get().initialized && !force) return;
    set({ loading: true, error: null });
    try {
      const [snapshot, modelInfo] = await Promise.all([
        knowledgeStudioGateway.getSnapshot(),
        knowledgeStudioGateway.getModelInfo(),
      ]);
      const selectedSourceId = get().selectedSourceId && snapshot.sources.some((item) => item.id === get().selectedSourceId)
        ? get().selectedSourceId : snapshot.sources[0]?.id ?? null;
      const selectedBatchId = get().selectedBatchId && snapshot.batches.some((item) => item.id === get().selectedBatchId)
        ? get().selectedBatchId : snapshot.batches[0]?.id ?? null;
      set({ snapshot, modelInfo, selectedSourceId, selectedBatchId, initialized: true, loading: false });
      if (selectedSourceId && !get().sourceDetail) await get().selectSource(selectedSourceId);
      if (selectedBatchId && !get().batch) await get().selectBatch(selectedBatchId);
    } catch (error) {
      set({ loading: false, error: message(error) });
    }
  },
  setTab: (tab) => set({ tab }),
  selectSource: async (id) => {
    set({ selectedSourceId: id, sourceDetail: null, error: null });
    try {
      set({ sourceDetail: await knowledgeStudioGateway.getSource(id) });
    } catch (error) {
      set({ error: message(error) });
    }
  },
  selectBatch: async (id) => {
    set({ selectedBatchId: id, batch: null, error: null });
    try {
      set({ batch: await knowledgeStudioGateway.getBatch(id) });
    } catch (error) {
      set({ error: message(error) });
    }
  },
  importFiles: async () => {
    set({ busy: true, error: null, importNotice: null });
    try {
      const result = await knowledgeStudioGateway.importFiles();
      const notice = result.failures.length > 0
        ? `已导入 ${result.sources.length} 份，${result.failures.length} 份失败：${result.failures.map((item) => `${item.name}（${item.error}）`).join("；")}`
        : result.sources.length > 0 ? `已导入 ${result.sources.length} 份资料` : null;
      set({ busy: false, importNotice: notice, sourceDetail: null });
      await get().initialize(true);
      if (result.sources[0]) await get().selectSource(result.sources[0].id);
    } catch (error) {
      set({ busy: false, error: message(error) });
    }
  },
  importText: async (request) => {
    set({ busy: true, error: null, importNotice: null });
    try {
      const source = await knowledgeStudioGateway.importText(request);
      set({ busy: false, importNotice: `已导入“${source.title}”`, sourceDetail: null });
      await get().initialize(true);
      await get().selectSource(source.id);
    } catch (error) {
      set({ busy: false, error: message(error) });
    }
  },
  importUrl: async (request) => {
    set({ busy: true, error: null, importNotice: null });
    try {
      const source = await knowledgeStudioGateway.importUrl(request);
      set({ busy: false, importNotice: `已导入网页“${source.title}”`, sourceDetail: null });
      await get().initialize(true);
      await get().selectSource(source.id);
    } catch (error) {
      set({ busy: false, error: message(error) });
    }
  },
  deleteSource: async (request) => {
    set({ busy: true, error: null });
    try {
      const result = await knowledgeStudioGateway.deleteSource(request);
      const detail = result.deletedBatchCount > 0
        ? `，并清理 ${result.deletedBatchCount} 个关联任务${result.deletedArtifactCount > 0 ? `和 ${result.deletedArtifactCount} 个题包文件` : ""}`
        : "";
      set({ busy: false, selectedSourceId: null, sourceDetail: null, importNotice: result.deleted ? `资料已删除${detail}` : "资料不存在或已经删除" });
      await get().initialize(true);
    } catch (error) {
      set({ busy: false, error: message(error) });
    }
  },
  createBatch: async (request) => {
    set({ busy: true, error: null, progress: null, tab: "review" });
    try {
      const batch = await knowledgeStudioGateway.createBatch(request);
      set({ busy: false, batch, selectedBatchId: batch.id, progress: null });
      await get().initialize(true);
      await get().selectBatch(batch.id);
    } catch (error) {
      set({ busy: false, error: message(error) });
      await get().initialize(true);
    }
  },
  retryBatch: async (id) => {
    set({ busy: true, error: null, progress: null, tab: "review" });
    try {
      const batch = await knowledgeStudioGateway.retryBatch(id);
      set({ busy: false, batch, selectedBatchId: id, progress: null });
      await get().initialize(true);
      await get().selectBatch(id);
    } catch (error) {
      set({ busy: false, error: message(error) });
      await get().initialize(true);
    }
  },
  cancelBatch: async (id) => {
    try {
      set({ batch: await knowledgeStudioGateway.cancelBatch(id) });
    } catch (error) {
      set({ error: message(error) });
    }
  },
  deleteBatch: async (id) => {
    set({ busy: true, error: null });
    try {
      const result = await knowledgeStudioGateway.deleteBatch(id);
      set({
        busy: false,
        selectedBatchId: null,
        batch: null,
        progress: null,
        importNotice: result.deleted
          ? `生成任务已删除${result.deletedArtifactCount > 0 ? `，并清理 ${result.deletedArtifactCount} 个题包文件` : ""}`
          : "生成任务不存在或已经删除",
      });
      await get().initialize(true);
    } catch (error) {
      set({ busy: false, error: message(error) });
    }
  },
  reviewCandidate: async (request) => {
    set({ busy: true, error: null });
    try {
      const batch = await knowledgeStudioGateway.reviewCandidate(request);
      set({ busy: false, batch });
      await get().initialize(true);
    } catch (error) {
      set({ busy: false, error: message(error) });
    }
  },
  publishBatch: async (id) => {
    set({ busy: true, error: null });
    try {
      const batch = await knowledgeStudioGateway.publishBatch(id);
      set({ busy: false, batch });
      await get().initialize(true);
    } catch (error) {
      set({ busy: false, error: message(error) });
    }
  },
  revealArtifact: async (path) => {
    try {
      await knowledgeStudioGateway.revealArtifact(path);
    } catch (error) {
      set({ error: message(error) });
    }
  },
  applyProgress: (progress) => {
    set((state) => ({
      progress,
      batch: state.batch?.id === progress.batchId
        ? {
          ...state.batch,
          status: progress.status,
          stage: progress.stage,
          progress: progress.progress,
          ...(progress.providerId ? { providerId: progress.providerId } : {}),
          ...(progress.modelId ? { modelId: progress.modelId } : {}),
          events: progress.event && !state.batch.events.some((event) => event.id === progress.event!.id)
            ? [...state.batch.events, progress.event]
            : state.batch.events,
        }
        : state.batch,
      snapshot: state.snapshot ? {
        ...state.snapshot,
        batches: state.snapshot.batches.map((batch) => batch.id === progress.batchId
          ? { ...batch, status: progress.status, stage: progress.stage, progress: progress.progress }
          : batch),
      } : null,
    }));
    if (["review", "failed", "cancelled", "published"].includes(progress.status)
      && get().selectedBatchId === progress.batchId) {
      void get().selectBatch(progress.batchId);
      void get().initialize(true);
    }
  },
  clearError: () => set({ error: null }),
}));
