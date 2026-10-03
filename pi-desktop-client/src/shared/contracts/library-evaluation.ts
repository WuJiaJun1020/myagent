import type { LibraryStrategyProfile } from "./library-strategy";
import type { LibraryQaDebugCall } from "./smart-library";
import type { LibraryLocalModels, LibrarySearchHit, LibrarySearchTimings, LibraryRetrievalPlan, LibraryQaCitation } from "./smart-library";

export type EvaluationSpan = { chapter: number; start: number; end: number };
export type EvaluationScore = { required: number; complete: number; recall: number; coverage: number; all: boolean; evidence: { id: string; complete: boolean; coverage: number }[] };
export type EvaluationTimings = LibrarySearchTimings & Partial<Record<"retrievalMs" | "contextMs" | "scoringMs" | "rewriteMs", number>>;
export type EvaluationRow = {
  id: string; question: string; difficulty: string; answer?: string; reasoning?: string; state: "completed" | "failed"; elapsedMs: number; error?: string; warnings: string[];
  usedContext?: string[]; query?: string; debug?: LibraryQaDebugCall[]; stages: Record<string, EvaluationScore>; hits: LibrarySearchHit[]; timings?: EvaluationTimings;
  retrievalPlan?: LibraryRetrievalPlan; contexts?: LibraryQaCitation[];
  gold: { id: string; quote: string; supports: string; span: EvaluationSpan }[];
};
export type EvaluationReport = {
  schema: 1; runId?: string; profile?: LibraryStrategyProfile; stageLimits?: Record<string, number>; dataset: string; datasetHash: string; note: string; book: string; version: string; source: string; indexModel: string; revision?: string;
  settings: LibraryLocalModels; startedAt: number; finishedAt?: number; preparationMs?: number; rows: EvaluationRow[];
  summary: Record<string, { total: number; complete: number; microRecall: number; macroRecall: number; macroCoverage: number; allQuestions: number }>;
};
export type EvaluationStatus = { state: "idle" | "running" | "completed" | "stopped" | "failed"; completed: number; total: number; current?: string; error?: string; notice?: string; report?: EvaluationReport; comparison?: { total: number; completed: number; currentProfile: string } };
export type EvaluationReference = { version: string; profileId?: string; runId?: string; question: string; kind: "gold" | "hit"; id: string };

export type EvaluationOptions = { profileId?: string; profileIds?: string[]; runId?: string };
export type EvaluationRunSummary = { runId: string; profileId: string; name: string; revision: number; startedAt: number; state: EvaluationStatus["state"]; datasetHash: string; completed: number; total: number; failed?: number; recall: number; coverage: number; meanMs: number; meanReturnedChars?: number };
