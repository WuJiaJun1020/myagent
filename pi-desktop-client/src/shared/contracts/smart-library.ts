import type { AiAvailableModel, ModelReasoningLevel, ModelRequest, ModelPreparedRequest } from "../../platform/shared/ai/model-gateway";
import type { AiResolvedModel, AiUsage } from "../../platform/shared/ai/contracts";
export const DEFAULT_LIBRARY_QA_STRATEGY = "standard-rag";
export type LibraryQaStrategyInfo = { id: string; name: string; version: string; description: string; model?: AiResolvedModel | null; reasoning?: ModelReasoningLevel };
export type LibraryQaRange = { start: number; end: number };
export type LibraryQaDebugCall = { purpose: string; request: ModelRequest; prepared?: ModelPreparedRequest; response?: string; usage?: AiUsage; error?: string };
export type LibraryQaInput = { id: string; sessionId?: string; strategyId?: string; question: string; model: AiResolvedModel; reasoning?: ModelReasoningLevel; readingPage?: number; readingStartPage?: number };
export type LibraryQaCitation = { number: number; reference: LibraryEvidenceReference; excerpt: LibraryEvidence; sourceIds?: string[] };
export type LibraryQaTurn = LibraryQaInput & { book: string; profile?: import("./library-strategy").LibraryStrategyProfile; strategy?: LibraryQaStrategyInfo; seq?: number; revision: number; createdAt: number; updatedAt: number; state: "retrieving" | "rewriting" | "answering" | "completed" | "stopped" | "failed"; answer: string; version?: string; query?: string; citations: LibraryQaCitation[]; warnings: string[]; error?: string; usage?: AiUsage; debug?: LibraryQaDebugCall[]; retrieval?: LibrarySearchResult; context?: { estimatedInputTokens: number; modelContextWindowTokens?: number } };
export type LibraryQaSession = { id: string; title: string; createdAt: number; manualTitle?: number; strategyId?: string; range?: LibraryQaRange | null };
export type LibraryQaHistory = { turns: LibraryQaTurn[]; hasMore: boolean };
export type LibraryQaModels = { models: AiAvailableModel[]; configured: AiResolvedModel | null };
export type LibraryChapter = { id: number; title: string; characters: number };
export type LibraryBook = { id: string; title: string; author: string; format: "txt" | "epub"; chapters: LibraryChapter[]; addedAt: number; chapter: number };
export interface LibraryApi {
  strategyProfiles(request?: import("./library-strategy").StrategyProfileAction): Promise<import("./library-strategy").LibraryStrategyProfile[]>;
  evaluationRuns(id: string): Promise<import("./library-evaluation").EvaluationRunSummary[]>;
  questionBank(id: string, action?: import("./library-question-bank").BankReviewRequest): Promise<import("./library-question-bank").QuestionBank>;
  questionBankEvidence(id: string, question: string, evidence: string): Promise<LibraryEvidence>;
  evaluate(id: string, action: "status" | "start" | "stop", options?: import("./library-evaluation").EvaluationOptions): Promise<import("./library-evaluation").EvaluationStatus>;
  evaluationEvidence(id: string, reference: import("./library-evaluation").EvaluationReference): Promise<LibraryEvidence>;
  qaStrategies(): Promise<LibraryQaStrategyInfo[]>;
  qaModels(): Promise<LibraryQaModels>;
  qaSessions(id: string, action?: "list" | "create" | "clear" | "delete" | "rename" | "range" | "strategy", sessionId?: string, title?: string, range?: LibraryQaRange | null, strategyId?: string): Promise<LibraryQaSession[]>;
  qaHistory(id: string, before?: number, sessionId?: string): Promise<LibraryQaHistory>;
  qaAsk(id: string, request: LibraryQaInput): Promise<LibraryQaTurn>;
  qaStop(id: string, turn: string): Promise<void>;
  qaEvidence(id: string, turn: string, number: number): Promise<LibraryEvidence>;
  onQaUpdate(listener: (turn: LibraryQaTurn) => void): () => void;
  search(id: string, request: LibrarySearchRequest): Promise<LibrarySearchResult>;
  cancelSearch(id: string, token: string): Promise<void>;
  evidence(id: string, reference: LibraryEvidenceReference): Promise<LibraryEvidence>;
  modelRuntime(action: "status" | "start" | "stop" | "ensure", profileId?: string): Promise<LibraryRuntimeStatus>;
  indexAction(id: string, action: "status" | "prepare" | "start" | "pause" | "rebuild", profileId?: string): Promise<LibraryIndexStatus>;
  indexChunk(id: string, ordinal: number, profileId?: string): Promise<LibraryIndexChunk | null>;
  list(): Promise<LibraryBook[]>;
  importBooks(): Promise<{ books: LibraryBook[]; errors: string[] }>;
  chapter(id: string, chapter: number): Promise<string>;
  remember(id: string, chapter: number): Promise<void>;
  getLocalModels(): Promise<LibraryLocalModels>;
  saveLocalModels(settings: LibraryLocalModels): Promise<void>;
  testLocalModel(kind: "embedding" | "reranker", settings: LibraryLocalModels, caseId?: string): Promise<LibraryModelProbe>;
}
export type LibrarySearchRequest = { token: string; profileId?: string; query: string; subqueries?: string[]; mode: "keyword" | "vector" | "hybrid"; readingPage?: number; readingStartPage?: number; rerank: boolean };
export type LibraryEvidenceReference = { version: string; id: string; profileId?: string; readingPage?: number; readingStartPage?: number; contextSpan?: { start: number; end: number } };
export type LibraryQueryMatch = { query: number; keywordRank?: number; vectorRank?: number; fusionRank: number };
export type LibrarySearchHit = { id: string; ordinal: number; chapter: number; title: string; start: number; end: number; text: string; keywordRank?: number; vectorRank?: number; rerankScore?: number; queryMatches?: LibraryQueryMatch[]; rerankQuery?: number; queryRank?: number; selectionReason?: string };
export type LibraryRetrievalPlan = {
  queries: string[];
  routes: { query: number; keywordCount: number; vectorCount: number }[];
  candidates: { id: string; chapter: number; queryMatches: LibraryQueryMatch[]; rerankQuery: number; queryRank?: number; rerankScore?: number; selected: boolean; reason: string }[];
  contexts?: { id: string; decision: "included" | "merged" | "budget" | "limit"; reason: string }[];
};
export type LibrarySearchTimings = Partial<Record<"setupMs" | "keywordMs" | "embeddingMs" | "vectorMs" | "fusionMs" | "rerankMs", number>>;
export type LibrarySearchResult = { version: string; hits: LibrarySearchHit[]; warnings: string[]; elapsedMs: number; keywordCount: number; vectorCount: number; reranked: boolean; timings?: LibrarySearchTimings; plan?: LibraryRetrievalPlan; diagnostics?: { keyword: LibrarySearchHit[]; vector: LibrarySearchHit[]; fused: LibrarySearchHit[]; reranked: LibrarySearchHit[] } };
export type LibraryEvidence = { title: string; text: string; highlight: { start: number; end: number }; page?: number; pageHighlight?: { start: number; end: number }; locationError?: string };
export type LibraryRuntimeStatus = { state: "stopped" | "starting" | "ready" | "stopping" | "failed"; owned: boolean; busy: boolean; gpu?: string; error?: string; log?: string; elapsedSeconds?: number; managedRequired?: boolean; notice?: string };

export type LibraryIndexStatus = {
  state: "empty" | "prepared" | "running" | "paused" | "failed" | "ready";
  version?: string; activeVersion?: string; stale?: boolean; storageBytes?: number; total: number; completed: number; chapters: number;
  model?: string; dimensions?: number; error?: string; updatedAt?: number;
};
export type LibraryIndexChunk = {
  id: string; ordinal: number; chapter: number; title: string; paragraphId: string;
  start: number; end: number; text: string; sourceVersion: string; hash: string;
  previous: string | null; next: string | null;
};

export type LibraryLocalModels = {
  embeddingUrl: string;
  embeddingModel: string;
  rerankerUrl: string;
  rerankerModel: string;
};
export const DEFAULT_LIBRARY_LOCAL_MODELS: LibraryLocalModels = {
  embeddingUrl: "http://127.0.0.1:18081/api/embed",
  embeddingModel: "Qwen/Qwen3-Embedding-0.6B",
  rerankerUrl: "http://127.0.0.1:18081/rerank",
  rerankerModel: "Qwen/Qwen3-Reranker-0.6B",
};
export type LibraryModelProbe = { elapsedMs: number; summary: string; dimensions?: number; ranking?: number[]; scores?: { index: number; score: number }[]; caseId?: string; matched?: boolean };
