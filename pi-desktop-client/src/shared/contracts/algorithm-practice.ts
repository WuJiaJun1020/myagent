export const ALGORITHM_PRACTICE_IPC = {
  getSnapshot: "algorithm-practice:get-snapshot",
  getProblem: "algorithm-practice:get-problem",
  saveDraft: "algorithm-practice:save-draft",
  resetDraft: "algorithm-practice:reset-draft",
  run: "algorithm-practice:run",
} as const;

export const ALGORITHM_MODES = ["leetcode", "acm"] as const;
export type AlgorithmMode = (typeof ALGORITHM_MODES)[number];

export const ALGORITHM_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type AlgorithmDifficulty = (typeof ALGORITHM_DIFFICULTIES)[number];

export type AlgorithmRuntimeInfo = {
  available: boolean;
  source: "embedded" | "configured" | "system" | "missing";
  displayName: string;
  version?: string;
  message?: string;
};

export type AlgorithmCategory = {
  name: string;
  count: number;
};

export type AlgorithmModeProgress = {
  solved: boolean;
  attempts: number;
  bestTimeMs?: number;
  solvedAt?: string;
};

export type AlgorithmProblemSummary = {
  id: number;
  slug: string;
  title: string;
  difficulty: AlgorithmDifficulty;
  category: string;
  tags: string[];
  progress: Record<AlgorithmMode, AlgorithmModeProgress>;
};

export type AlgorithmPracticeSnapshot = {
  collection: { id: string; title: string; description: string };
  categories: AlgorithmCategory[];
  problems: AlgorithmProblemSummary[];
  runtime: AlgorithmRuntimeInfo;
  solved: Record<AlgorithmMode, number>;
};

export type AlgorithmProblemExample = {
  leetcodeInput: string;
  output: string;
  acmStdin: string;
  acmStdout: string;
  explanation: string;
  imageFile?: string;
  /** Main-process generated URL so packaged resources never need file:// access. */
  imageDataUrl?: string;
};

export type AlgorithmReferenceAnswer = {
  mode: AlgorithmMode;
  name: string;
  file: string;
  code: string;
};

export type AlgorithmProblemDetail = Omit<AlgorithmProblemSummary, "progress"> & {
  description: string;
  constraints: string[];
  followUp: string;
  leetcode: {
    className: string;
    methodName?: string;
    parameters: Array<{ name: string; type: string }>;
    returnType?: string;
  };
  acm: {
    inputFields: Array<{ name: string; type: string }>;
    outputType: string;
    description: string;
  };
  examples: AlgorithmProblemExample[];
  templates: Record<AlgorithmMode, string>;
  drafts: Record<AlgorithmMode, string>;
  progress: Record<AlgorithmMode, AlgorithmModeProgress>;
  answers: AlgorithmReferenceAnswer[];
};

export type AlgorithmSaveDraftRequest = {
  slug: string;
  mode: AlgorithmMode;
  code: string;
};

export type AlgorithmResetDraftRequest = {
  slug: string;
  mode: AlgorithmMode;
};

export type AlgorithmRunRequest = AlgorithmSaveDraftRequest & {
  answerFile?: string;
};

export type AlgorithmVerdict =
  | "accepted"
  | "wrong_answer"
  | "runtime_error"
  | "time_limit_exceeded"
  | "output_limit_exceeded"
  | "runtime_unavailable"
  | "internal_error";

export type AlgorithmCaseResult = {
  index: number;
  ok: boolean;
  input: string;
  expected: string;
  actual: string;
  error?: string;
  timeMs: number;
};

export type AlgorithmRunResult = {
  submissionId: string;
  slug: string;
  mode: AlgorithmMode;
  verdict: AlgorithmVerdict;
  passed: number;
  total: number;
  durationMs: number;
  cases: AlgorithmCaseResult[];
  error?: string;
  progress: AlgorithmModeProgress;
};
