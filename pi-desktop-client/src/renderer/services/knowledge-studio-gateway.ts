import type {
  KnowledgeCreateBatchRequest,
  KnowledgeDeleteBatchResult,
  KnowledgeDeleteSourceRequest,
  KnowledgeDeleteSourceResult,
  KnowledgeGenerationBatch,
  KnowledgeGenerationProgress,
  KnowledgeImportFilesResult,
  KnowledgeImportTextRequest,
  KnowledgeImportUrlRequest,
  KnowledgeInterviewImportResult,
  KnowledgeReviewCandidateRequest,
  KnowledgeSourceDetail,
  KnowledgeSourceOriginalPreview,
  KnowledgeSourceSummary,
  KnowledgeStudioModelInfo,
  KnowledgeWindowPreview,
  KnowledgeStudioSnapshot,
} from "../../shared/contracts/knowledge-studio";

export interface KnowledgeStudioGateway {
  getSnapshot(): Promise<KnowledgeStudioSnapshot>;
  getModelInfo(): Promise<KnowledgeStudioModelInfo>;
  previewBatch(request: KnowledgeCreateBatchRequest): Promise<KnowledgeWindowPreview>;
  getSource(id: string): Promise<KnowledgeSourceDetail | null>;
  getSourceOriginal(id: string): Promise<KnowledgeSourceOriginalPreview | null>;
  importText(request: KnowledgeImportTextRequest): Promise<KnowledgeSourceSummary>;
  importFiles(): Promise<KnowledgeImportFilesResult>;
  importUrl(request: KnowledgeImportUrlRequest): Promise<KnowledgeSourceSummary>;
  deleteSource(request: KnowledgeDeleteSourceRequest): Promise<KnowledgeDeleteSourceResult>;
  createBatch(request: KnowledgeCreateBatchRequest): Promise<KnowledgeGenerationBatch>;
  retryBatch(id: string): Promise<KnowledgeGenerationBatch>;
  cancelBatch(id: string): Promise<KnowledgeGenerationBatch>;
  deleteBatch(id: string): Promise<KnowledgeDeleteBatchResult>;
  getBatch(id: string): Promise<KnowledgeGenerationBatch | null>;
  reviewCandidate(request: KnowledgeReviewCandidateRequest): Promise<KnowledgeGenerationBatch>;
  publishBatch(id: string): Promise<KnowledgeGenerationBatch>;
  importSupportedToInterview(id: string): Promise<KnowledgeInterviewImportResult>;
  revealArtifact(path: string): Promise<void>;
  onProgress(listener: (progress: KnowledgeGenerationProgress) => void): () => void;
}

class DesktopKnowledgeStudioGateway implements KnowledgeStudioGateway {
  getSnapshot = () => window.piDesktop.getKnowledgeStudioSnapshot();
  getModelInfo = () => window.piDesktop.getKnowledgeStudioModelInfo();
  previewBatch = (request: KnowledgeCreateBatchRequest) => window.piDesktop.previewKnowledgeBatch(request);
  getSource = (id: string) => window.piDesktop.getKnowledgeSource(id);
  getSourceOriginal = (id: string) => window.piDesktop.getKnowledgeSourceOriginal(id);
  importText = (request: KnowledgeImportTextRequest) => window.piDesktop.importKnowledgeText(request);
  importFiles = () => window.piDesktop.importKnowledgeFiles();
  importUrl = (request: KnowledgeImportUrlRequest) => window.piDesktop.importKnowledgeUrl(request);
  deleteSource = (request: KnowledgeDeleteSourceRequest) => window.piDesktop.deleteKnowledgeSource(request.id, request.deleteReferencingBatches);
  createBatch = (request: KnowledgeCreateBatchRequest) => window.piDesktop.createKnowledgeBatch(request);
  retryBatch = (id: string) => window.piDesktop.retryKnowledgeBatch(id);
  cancelBatch = (id: string) => window.piDesktop.cancelKnowledgeBatch(id);
  deleteBatch = (id: string) => window.piDesktop.deleteKnowledgeBatch(id);
  getBatch = (id: string) => window.piDesktop.getKnowledgeBatch(id);
  reviewCandidate = (request: KnowledgeReviewCandidateRequest) => window.piDesktop.reviewKnowledgeCandidate(request);
  publishBatch = (id: string) => window.piDesktop.publishKnowledgeBatch(id);
  importSupportedToInterview = (id: string) => window.piDesktop.importSupportedKnowledgeToInterview(id);
  revealArtifact = (path: string) => window.piDesktop.revealKnowledgeArtifact(path);
  onProgress = (listener: (progress: KnowledgeGenerationProgress) => void) => window.piDesktop.onKnowledgeGenerationProgress(listener);
}

export const knowledgeStudioGateway: KnowledgeStudioGateway = new DesktopKnowledgeStudioGateway();
