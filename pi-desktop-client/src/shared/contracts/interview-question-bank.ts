import type {
  InterviewQuestionDifficulty,
  InterviewQuestionKind,
} from "./interview";

/**
 * Question-bank IPC is deliberately separate from interview-session IPC.
 * Reusable questions evolve over time while a session keeps an immutable
 * snapshot of the exact prompt and rubric that were used in that interview.
 */
export const QUESTION_BANK_IPC = {
  getSnapshot: "interview:question-bank:get-snapshot",
  listQuestions: "interview:question-bank:list",
  getQuestion: "interview:question-bank:get",
  setFavorite: "interview:question-bank:set-favorite",
} as const;

export const QUESTION_BANK_SOURCE_TYPES = [
  "builtin",
  "file",
  "web",
  "manual",
  "generated",
] as const;

export const QUESTION_BANK_STATUSES = [
  "draft",
  "reviewing",
  "published",
  "deprecated",
] as const;

export type QuestionBankSourceType = (typeof QUESTION_BANK_SOURCE_TYPES)[number];
export type QuestionBankStatus = (typeof QUESTION_BANK_STATUSES)[number];

export type QuestionBankRubricItem = {
  id: string;
  label: string;
  description: string;
  weight: number;
  critical: boolean;
};

export type QuestionBankFollowUp = {
  prompt: string;
  trigger: string;
};

export type QuestionBankSource = {
  id: string;
  type: QuestionBankSourceType;
  title: string;
  uri?: string;
  mimeType?: string;
  license?: string;
  attribution?: string;
  parserId?: string;
  parserVersion?: string;
  contentHash: string;
  locator?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type QuestionBankQuestionSummary = {
  id: string;
  stableKey: string;
  version: number;
  status: QuestionBankStatus;
  title: string;
  prompt: string;
  kind: InterviewQuestionKind;
  subtype: string;
  difficulty: InterviewQuestionDifficulty;
  roles: string[];
  seniority: string[];
  competencies: string[];
  skills: string[];
  estimatedSeconds: number;
  favorite: boolean;
  sourceLabel: string;
  updatedAt: string;
};

export type QuestionBankQuestionDetail = QuestionBankQuestionSummary & {
  intent: string;
  answerOutline: string[];
  /** A complete, spoken-style answer when the source provides one. */
  referenceAnswer?: string;
  evidence?: Array<{ sourceId: string; sourceTitle: string; segmentId: string; quote: string }>;
  rubric: QuestionBankRubricItem[];
  commonMistakes: string[];
  followUps: QuestionBankFollowUp[];
  source: QuestionBankSource;
};

export type QuestionBankSnapshot = {
  total: number;
  published: number;
  favorites: number;
  byKind: Record<InterviewQuestionKind, number>;
  byDifficulty: Record<InterviewQuestionDifficulty, number>;
  roles: Array<{ value: string; label: string; count: number }>;
  skills: Array<{ value: string; label: string; count: number }>;
};

export type QuestionBankListQuery = {
  search?: string;
  kind?: InterviewQuestionKind;
  difficulty?: InterviewQuestionDifficulty;
  role?: string;
  skill?: string;
  favoritesOnly?: boolean;
  limit?: number;
  offset?: number;
};

export type QuestionBankListResult = {
  items: QuestionBankQuestionSummary[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};

export type QuestionBankFavoriteRequest = {
  questionId: string;
  favorite: boolean;
};

export type QuestionBankFavoriteResult = {
  questionId: string;
  favorite: boolean;
  favorites: number;
};
