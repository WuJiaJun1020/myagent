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
  prepareInterview: "interview:prepare",
  getJobLibrary: "interview:get-job-library",
  collectJobs: "interview:collect-jobs",
  preparationProgress: "interview:preparation-progress",
  jobCollectionProgress: "interview:job-collection-progress",
} as const;

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
  resumeText: string;
  questionCount: number;
  competencies: string[];
};

export type InterviewListItem = {
  id: string;
  title: string;
  candidateName: string;
  positionTitle: string;
  status: InterviewStatus;
  currentQuestionIndex: number;
  questionCount: number;
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
};

export type InterviewPrepareRequest = {
  interviewId: string;
  operationId: string;
  /** Must be true before a resume or JD may be sent to the configured provider. */
  privacyConfirmed: true;
};

export type InterviewPreparationProgress = {
  interviewId: string;
  operationId: string;
  phase: "validating" | "calling_model" | "saving" | "completed" | "failed";
  message: string;
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
  status: "completed" | "failed";
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
