import type {
  InterviewQuestionDifficulty,
  InterviewQuestionKind,
} from "./interview";
import type {
  QuestionBankFollowUp,
  QuestionBankListQuery,
  QuestionBankRubricItem,
  QuestionBankSource,
} from "./interview-question-bank";

export const QUESTION_PRACTICE_IPC = {
  getOverview: "interview:question-practice:get-overview",
  startSession: "interview:question-practice:start-session",
  getSession: "interview:question-practice:get-session",
  saveDraft: "interview:question-practice:save-draft",
  submitAnswer: "interview:question-practice:submit-answer",
  completeReview: "interview:question-practice:complete-review",
  skipQuestion: "interview:question-practice:skip-question",
  abandonSession: "interview:question-practice:abandon-session",
  listHistory: "interview:question-practice:list-history",
} as const;

export const QUESTION_PRACTICE_SELF_RATINGS = [
  "needs_review",
  "developing",
  "mastered",
] as const;

export type QuestionPracticeSelfRating = (typeof QUESTION_PRACTICE_SELF_RATINGS)[number];
export type QuestionPracticeSessionStatus = "active" | "completed" | "abandoned";
export type QuestionPracticeItemStatus = "pending" | "answering" | "reviewing" | "completed" | "skipped";

export type QuestionPracticeSelection =
  | {
      kind: "single";
      questionId: string;
      expectedVersion?: number;
    }
  | {
      kind: "filtered";
      query: Omit<QuestionBankListQuery, "limit" | "offset">;
      count: number;
      order: "random" | "latest";
    };

export type QuestionPracticeStartRequest = {
  operationId: string;
  selection: QuestionPracticeSelection;
};

export type QuestionPracticeQueueItem = {
  id: string;
  ordinal: number;
  stableKey: string;
  version: number;
  title: string;
  difficulty: InterviewQuestionDifficulty;
  status: QuestionPracticeItemStatus;
};

export type QuestionPracticeReviewMaterial = {
  intent: string;
  answerOutline: string[];
  referenceAnswer?: string;
  rubric: QuestionBankRubricItem[];
  commonMistakes: string[];
  followUps: QuestionBankFollowUp[];
  source: QuestionBankSource;
};

export type QuestionPracticeCurrentItem = QuestionPracticeQueueItem & {
  questionId: string;
  prompt: string;
  kind: InterviewQuestionKind;
  roles: string[];
  seniority: string[];
  competencies: string[];
  skills: string[];
  estimatedSeconds: number;
  draftAnswer: string;
  draftRevision: number;
  answerText?: string;
  elapsedSeconds?: number;
  selfRating?: QuestionPracticeSelfRating;
  coveredRubricIds: string[];
  selfNote?: string;
  review?: QuestionPracticeReviewMaterial;
  startedAt?: string;
  submittedAt?: string;
  reviewedAt?: string;
};

export type QuestionPracticeSummary = {
  answered: number;
  reviewed: number;
  skipped: number;
  totalElapsedSeconds: number;
  ratingCounts: Record<QuestionPracticeSelfRating, number>;
  weakSkills: Array<{ value: string; count: number }>;
  weakCompetencies: Array<{ value: string; count: number }>;
};

export type QuestionPracticeSession = {
  id: string;
  status: QuestionPracticeSessionStatus;
  selectionKind: QuestionPracticeSelection["kind"];
  questionCount: number;
  currentOrdinal: number;
  stateVersion: number;
  queue: QuestionPracticeQueueItem[];
  currentItem: QuestionPracticeCurrentItem | null;
  summary: QuestionPracticeSummary;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  abandonedAt?: string;
};

export type QuestionPracticeOverview = {
  activeSession?: {
    id: string;
    currentOrdinal: number;
    questionCount: number;
    updatedAt: string;
  };
  completedSessions: number;
  practicedQuestions: number;
  dueReview: number;
};

export type QuestionPracticeSaveDraftRequest = {
  sessionId: string;
  itemId: string;
  draftRevision: number;
  answer: string;
  elapsedSeconds?: number;
};

export type QuestionPracticeSaveDraftResult = {
  sessionId: string;
  itemId: string;
  draftRevision: number;
  savedAt: string;
};

export type QuestionPracticeSubmitAnswerRequest = {
  sessionId: string;
  itemId: string;
  operationId: string;
  expectedStateVersion: number;
  draftRevision: number;
  answer: string;
  elapsedSeconds?: number;
};

export type QuestionPracticeCompleteReviewRequest = {
  sessionId: string;
  itemId: string;
  operationId: string;
  expectedStateVersion: number;
  selfRating: QuestionPracticeSelfRating;
  coveredRubricIds: string[];
  note?: string;
};

export type QuestionPracticeSkipRequest = {
  sessionId: string;
  itemId: string;
  operationId: string;
  expectedStateVersion: number;
};

export type QuestionPracticeAbandonRequest = {
  sessionId: string;
  operationId: string;
  expectedStateVersion: number;
};

export type QuestionPracticeHistoryQuery = {
  limit?: number;
  offset?: number;
};

export type QuestionPracticeHistoryItem = {
  id: string;
  status: QuestionPracticeSessionStatus;
  selectionKind: QuestionPracticeSelection["kind"];
  questionCount: number;
  currentOrdinal: number;
  answered: number;
  reviewed: number;
  skipped: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  abandonedAt?: string;
};

export type QuestionPracticeHistoryResult = {
  items: QuestionPracticeHistoryItem[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};
