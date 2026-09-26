import type { ModelCallDiagnostics } from "../../platform/shared/ai/model-gateway";

export const INTERVIEW_STATUSES = [
  "draft",
  "preparing",
  "ready",
  "interviewing",
  "generating_report",
  "completed",
] as const;

/** Stable IPC names shared by the main-process module and preload adapter. */
export const INTERVIEW_IPC = {
  getSnapshot: "interview:get-snapshot",
  getInterview: "interview:get",
  getInterviewSession: "interview:get-session",
  createInterview: "interview:create",
  deleteInterview: "interview:delete",
  finishInterview: "interview:finish",
  scoreInterview: "interview:score",
  sendChat: "interview:send-chat",
  simulateCandidateTurn: "interview:simulate-candidate-turn",
  candidateTurnProgress: "interview:candidate-turn-progress",
  startAlgorithmExam: "interview:algorithm-start",
  saveAlgorithmDraft: "interview:algorithm-save-draft",
  submitAlgorithmCode: "interview:algorithm-submit",
  getChatModelInfo: "interview:get-chat-model-info",
  getJobLibrary: "interview:get-job-library",
  collectJobs: "interview:collect-jobs",
  jobCollectionProgress: "interview:job-collection-progress",
} as const;

export type InterviewChatReasoning = "default" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type InterviewChatModel = { providerId: string; modelId: string };
export type InterviewChatSettings = { model?: InterviewChatModel; reasoning: InterviewChatReasoning };
export type InterviewChatPrompts = { systemPrompt: string; startInstruction: string; replyInstruction: string };
export type InterviewChatModelInfo = {
  availableModels: Array<InterviewChatModel & { name: string; reasoningLevels: Exclude<InterviewChatReasoning, "default">[];
    contextWindowTokens?: number }>;
};
export const DEFAULT_INTERVIEW_CHAT_MODEL = { providerId: "openai-codex", modelId: "gpt-6-luna" } as const;
export const DEFAULT_INTERVIEW_CHAT_SETTINGS: InterviewChatSettings = { reasoning: "medium" };
export const DEFAULT_CANDIDATE_CHAT_SETTINGS: InterviewChatSettings = { reasoning: "medium" };
export const DEFAULT_CANDIDATE_ERROR_RATE = 20;
export const DEFAULT_DIRECTOR_CHAT_SETTINGS: InterviewChatSettings = { reasoning: "medium" };
export const DEFAULT_SCORE_CHAT_SETTINGS: InterviewChatSettings = { reasoning: "medium" };
export const MAX_INTERVIEW_ROUNDS = 20;
export type InterviewDirectorConfig = { enabled: boolean; settings: InterviewChatSettings; prompt: string };

export const INTERVIEW_SCORE_DIMENSIONS = [
  { key: "technical", label: "岗位相关的技术理解", maxScore: 40 },
  { key: "practice", label: "实际工作与解决问题", maxScore: 45 },
  { key: "communication", label: "回答与沟通表现", maxScore: 15 },
] as const;
export type InterviewScoreDimensionKey = (typeof INTERVIEW_SCORE_DIMENSIONS)[number]["key"];
export type InterviewScoreDimension = { key: InterviewScoreDimensionKey; score: number | null;
  reason: string; evidence: Array<{ turnId: string; quote: string }> };
export type InterviewScoreReport = { id: string; interviewId: string; version: number;
  status: "succeeded" | "failed"; dimensions: InterviewScoreDimension[]; total: number | null;
  coveredWeight: number; model: InterviewChatModel; reasoning: InterviewChatReasoning;
  prompt: string; createdAt: string; error?: string; rawOutput?: string };
export type InterviewScoreRequest = { interviewId: string; operationId: string;
  settings: InterviewChatSettings; prompt: string };

export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const DEFAULT_INTERVIEW_COMPETENCIES = [
  "技术基础",
  "项目经验",
  "问题分析",
  "沟通表达",
] as const;

export type InterviewCreateRequest = {
  title?: string;
  candidateName: string;
  positionTitle: string;
  jobDescription: string;
  /** Local job-library record to snapshot into this interview at creation. */
  jobPostingId?: string;
  resumeText: string;
  questionCount: number;
  competencies: string[];
  /** Existing callers omit this; the new interview form enables it by default. */
  algorithmEnabled?: boolean;
  /** Fixed at creation; existing interviews are migrated as disabled. */
  directorEnabled?: boolean;
};

export type InterviewAlgorithmMode = "leetcode" | "acm";
export type InterviewAlgorithmStatus = "pending" | "active" | "passed" | "timed_out" | "unavailable" | "abandoned";
export type InterviewAlgorithmProblem = {
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  description: string;
  constraints: string[];
  examples: Array<{ leetcodeInput: string; output: string; acmStdin: string; acmStdout: string; explanation: string; imageDataUrl?: string }>;
  leetcode: { className: string; methodName?: string; parameters: Array<{ name: string; type: string }>; returnType?: string };
  acm: { inputFields: Array<{ name: string; type: string }>; outputType: string; description: string };
  templates: Record<InterviewAlgorithmMode, string>;
};
export type InterviewAlgorithmAttempt = {
  id: string;
  mode: InterviewAlgorithmMode;
  code: string;
  verdict: "accepted" | "wrong_answer" | "runtime_error" | "time_limit_exceeded" | "output_limit_exceeded" | "runtime_unavailable" | "internal_error";
  passed: number;
  total: number;
  durationMs: number;
  submittedAt: string;
};
export type InterviewAlgorithmExam = {
  status: InterviewAlgorithmStatus;
  problem: InterviewAlgorithmProblem;
  startedAt: string | null;
  deadlineAt: string | null;
  completedAt: string | null;
  passedMode: InterviewAlgorithmMode | null;
  drafts: Record<InterviewAlgorithmMode, string>;
  attempts: InterviewAlgorithmAttempt[];
};
export type InterviewAlgorithmDraftRequest = { interviewId: string; mode: InterviewAlgorithmMode; code: string };
export type InterviewAlgorithmSubmitRequest = InterviewAlgorithmDraftRequest & { operationId: string };

export type InterviewListItem = {
  id: string;
  title: string;
  candidateName: string;
  positionTitle: string;
  status: InterviewStatus;
  currentQuestionIndex: number;
  questionCount: number;
  directorEnabled?: boolean;
  competencies: string[];
  createdAt: string;
  updatedAt: string;
};

export type InterviewDocumentKind = "job_description" | "resume" | "rubric";

export type InterviewDocument = {
  id: string;
  interviewId: string;
  kind: InterviewDocumentKind;
  title: string;
  content: string;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
};

export type InterviewRecord = InterviewListItem & {
  documents: InterviewDocument[];
};

export const INTERVIEW_QUESTION_KINDS = ["technical", "project", "behavioral", "scenario"] as const;
export type InterviewQuestionKind = (typeof INTERVIEW_QUESTION_KINDS)[number];

export const INTERVIEW_QUESTION_DIFFICULTIES = ["introductory", "intermediate", "advanced"] as const;
export type InterviewQuestionDifficulty = (typeof INTERVIEW_QUESTION_DIFFICULTIES)[number];

/** Public plan metadata. Future question prompts and rubrics deliberately stay in the main process. */
export type InterviewPlanSummary = {
  id: string;
  version: number;
  promptVersion: string;
  questionCount: number;
  competencies: string[];
  createdAt: string;
};

export type InterviewCurrentQuestion = {
  id: string;
  ordinal: number;
  total: number;
  competency: string;
  kind: InterviewQuestionKind;
  difficulty: InterviewQuestionDifficulty;
  prompt: string;
};

export type InterviewSession = {
  interview: InterviewRecord;
  plan: InterviewPlanSummary | null;
  currentQuestion: InterviewCurrentQuestion | null;
  answeredCount: number;
  preparationError: { code: string; message: string } | null;
  turns: InterviewTurn[];
  debugEvents?: InterviewDebugEvent[];
  /** Durable, accepted-question-only topic ledger. Older interviews may not have one yet. */
  topicFlow?: InterviewTopicFlow;
  /** Older stored sessions and test fixtures may omit the exam. */
  algorithm?: InterviewAlgorithmExam | null;
  scoreReports?: InterviewScoreReport[];
};

export const INTERVIEW_QUESTION_TYPES = ["resume", "role", "foundation", "other"] as const;
export type InterviewQuestionType = (typeof INTERVIEW_QUESTION_TYPES)[number];
export type InterviewTopicSource = InterviewQuestionType;
export type InterviewTopicEvidence = "new" | "limited" | "none";
export type InterviewTopicBlock = {
  id: string;
  source: InterviewTopicSource;
  anchor: string;
  objective: string;
  questionRounds: number[];
  evidenceCount: number;
  noNewEvidenceStreak: number;
  status: "active" | "completed";
  exitReason?: string;
  revisitOf?: string;
};
export type InterviewTopicCoverage = {
  kind: "role" | "foundation";
  label: string;
  answerRound: number;
  evidence: InterviewTopicEvidence;
};
export type InterviewTopicFlow = {
  version: 1;
  blocks: InterviewTopicBlock[];
  coverage: InterviewTopicCoverage[];
  /** A related role/foundation question may stay inside a resume-project block. */
  questionSources?: Array<{ round: number; source: InterviewTopicSource; label: string }>;
  pendingRoleAbilities?: Array<{ label: string }>;
  foundationNeed: "unknown" | "needed" | "satisfied" | "not_needed";
};

export type InterviewWebSource = { title: string; url: string; snippet: string };

/** Program draw and model-reported result are distinct. The quote is checked against the visible answer, not fact-checked. */
export type CandidateMistakeOutcome = {
  requestedMode: "normal" | "mistake";
  mistakeMade: boolean;
  mistakeKind: "none" | "misconception" | "slip";
  mistakeQuote: string;
};

export type InterviewCallError = {
  code: string;
  message: string;
  stage?: "request" | "provider" | "json_syntax" | "json_schema" | "business_validation" | "output_length" | "unknown";
  retryable?: boolean;
  statusCode?: number;
  retryAfterMs?: number;
  diagnosticCode?: string;
  validationIssues?: string[];
};

export type InterviewCallTrace = {
  actor?: "interviewer" | "candidate" | "candidate_gate" | "director" | "score";
  operationId: string;
  status: "succeeded" | "failed";
  startedAt: string;
  finishedAt: string;
  requestedModel: InterviewChatModel;
  reasoning: InterviewChatReasoning;
  timeoutMs: number;
  /** Legacy traces may record an old application-side input budget. New calls use the model's own limit. */
  maxInputTokens?: number;
  /** Exact ordered provider messages. Full text is stored locally for debugging. */
  messages: Array<{ kind: "system_prompt" | "job_description" | "resume" | "history" | "candidate_message" | "candidate_control" | "topic_control" | "instruction" | "score_material"; role: "system" | "user" | "assistant"; content: string }>;
  attempts: Array<{
    providerId: string;
    modelId: string;
    startedAt: string;
    finishedAt: string;
    requestId?: string;
    diagnostics?: ModelCallDiagnostics;
    finishReason?: string;
    providerStopReason?: string;
      usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; cachedInputTokens?: number;
        cachedWriteTokens?: number; reasoningTokens?: number; costUsd?: number; durationMs?: number };
      /** Raw output of this attempt, retained when a later JSON repair succeeds. */
      outputText?: string;
      /** Additional app-authored instruction sent only for this repair attempt. */
      retryInstruction?: string;
      error?: InterviewCallError;
  }>;
  outputText?: string;
  candidateOutcome?: CandidateMistakeOutcome;
  /** Explains local replacement when a required closing reply still asks a new question. */
  deliveryNote?: string;
  error?: InterviewCallError;
};

export type InterviewDebugEvent = { id: string; ordinal: number; createdAt: string; trace: InterviewCallTrace };

export type InterviewTurn = {
  id: string;
  ordinal: number;
  role: "interviewer" | "candidate";
  source?: "manual" | "agent";
  content: string;
  createdAt: string;
  /** Classification of the accepted interviewer message. Older turns may omit it. */
  questionType?: InterviewQuestionType;
  search?: { query: string; sources: InterviewWebSource[] };
  candidateOutcome?: CandidateMistakeOutcome;
  trace?: InterviewCallTrace;
};

export type InterviewChatRequest = {
  interviewId: string;
  operationId: string;
  kind: "start" | "reply";
  content?: string;
  /** Omitted model keeps the interview default: GPT-6 Luna via the existing Pi model gateway. */
  settings?: InterviewChatSettings;
  /** Editable per-interview instructions; included in the exact system message for this call. */
  prompts?: InterviewChatPrompts;
  director?: InterviewDirectorConfig;
};

export type CandidateTurnRequest = {
  interviewId: string;
  operationId: string;
  candidateSettings: InterviewChatSettings;
  candidatePrompt: string;
  /** Percentage chance of one plausible technical mistake; sampled once per interviewer question. */
  candidateErrorRate?: number;
  interviewerSettings: InterviewChatSettings;
  interviewerPrompts: InterviewChatPrompts;
  director?: InterviewDirectorConfig;
};
export type CandidateTurnResult = {
  session: InterviewSession;
  candidateText: string;
  status: "completed" | "interviewer_failed";
  error?: string;
};
export type CandidateTurnProgress = {
  interviewId: string;
  operationId: string;
  session: InterviewSession;
};

export type InterviewSnapshot = {
  interviews: InterviewListItem[];
  counts: Record<InterviewStatus, number>;
};

export type InterviewVectorRecord = {
  id: string;
  interviewId: string;
  documentId: string;
  content: string;
  model: string;
  dimensions: number;
  vector: number[];
  updatedAt: string;
};

export type InterviewVectorQuery = {
  model: string;
  dimensions: number;
  vector: number[];
  interviewId?: string;
  documentId?: string;
  limit?: number;
};

export type InterviewVectorMatch = Omit<InterviewVectorRecord, "vector"> & {
  distance: number;
};

export const JOB_SOURCES = ["alibaba", "bytedance"] as const;

export type JobSource = (typeof JOB_SOURCES)[number];
export type JobCollectionStatus = "running" | "completed" | "partial" | "failed";

export type JobCollectionRequest = {
  sources: JobSource[];
  keywords: string[];
  limitPerSource: number;
};

export type CollectedJobPosting = {
  source: JobSource;
  sourceJobId: string;
  sourceCode: string;
  company: string;
  title: string;
  city: string;
  jobType: string;
  category: string;
  batch: string;
  department: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  rawText: string;
  sourceUrl: string;
  collectedAt: string;
};

export type JobPosting = CollectedJobPosting & {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type JobCollectionSourceResult = {
  source: JobSource;
  status: "completed" | "partial" | "failed";
  collected: number;
  inserted: number;
  updated: number;
  unchanged: number;
  error?: string;
};

export type JobCollectionRun = {
  id: string;
  status: JobCollectionStatus;
  sources: JobSource[];
  keywords: string[];
  limitPerSource: number;
  results: JobCollectionSourceResult[];
  startedAt: string;
  finishedAt?: string;
};

export type JobLibrarySnapshot = {
  jobs: JobPosting[];
  total: number;
  bySource: Record<JobSource, number>;
  lastRun: JobCollectionRun | null;
};

export type JobCollectionProgress = {
  runId: string;
  source?: JobSource;
  phase: "starting" | "opening" | "searching" | "saving" | "completed" | "failed";
  message: string;
  collected: number;
};

export type JobCollectionResult = {
  run: JobCollectionRun;
  snapshot: JobLibrarySnapshot;
};
