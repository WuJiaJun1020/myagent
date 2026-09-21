import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  INTERVIEW_QUESTION_DIFFICULTIES,
  INTERVIEW_QUESTION_KINDS,
  INTERVIEW_STATUSES,
  type CollectedJobPosting,
  type InterviewCreateRequest,
  type InterviewDocument,
  type InterviewDocumentKind,
  type InterviewCurrentQuestion,
  type InterviewListItem,
  type InterviewPlanSummary,
  type InterviewQuestionDifficulty,
  type InterviewQuestionKind,
  type InterviewRecord,
  type InterviewSession,
  type InterviewSnapshot,
  type InterviewStatus,
  type JobCollectionRequest,
  type JobCollectionRun,
  type JobCollectionSourceResult,
  type JobCollectionStatus,
  type JobLibrarySnapshot,
  type JobPosting,
  type JobSource,
} from "../../shared/contracts/interview";
import type {
  QuestionBankFavoriteResult,
  QuestionBankListQuery,
  QuestionBankListResult,
  QuestionBankQuestionDetail,
  QuestionBankQuestionSummary,
  QuestionBankSnapshot,
  QuestionBankSource as QuestionBankApiSource,
  QuestionBankSourceType,
  QuestionBankStatus as QuestionBankApiStatus,
} from "../../shared/contracts/interview-question-bank";
import {
  QUESTION_PRACTICE_SELF_RATINGS,
  type QuestionPracticeAbandonRequest,
  type QuestionPracticeCompleteReviewRequest,
  type QuestionPracticeCurrentItem,
  type QuestionPracticeHistoryQuery,
  type QuestionPracticeHistoryResult,
  type QuestionPracticeItemStatus,
  type QuestionPracticeOverview,
  type QuestionPracticeQueueItem,
  type QuestionPracticeSaveDraftRequest,
  type QuestionPracticeSaveDraftResult,
  type QuestionPracticeSelection,
  type QuestionPracticeSelfRating,
  type QuestionPracticeSession,
  type QuestionPracticeSessionStatus,
  type QuestionPracticeSkipRequest,
  type QuestionPracticeStartRequest,
  type QuestionPracticeSubmitAnswerRequest,
  type QuestionPracticeSummary,
} from "../../shared/contracts/interview-question-practice";
import type { LoadedQuestionBankCatalog, QuestionBankPack } from "./question-bank-catalog";

type InterviewRow = {
  id: string;
  title: string;
  candidate_name: string;
  position_title: string;
  status: string;
  current_question_index: number;
  question_count: number;
  competencies_json: string;
  created_at: string;
  updated_at: string;
};

type DocumentRow = {
  id: string;
  interview_id: string;
  kind: string;
  title: string;
  content: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
};

type JobPostingRow = {
  id: string;
  source: string;
  source_job_id: string;
  source_code: string;
  company: string;
  title: string;
  city: string;
  job_type: string;
  category: string;
  batch: string;
  department: string;
  description: string;
  responsibilities_json: string;
  requirements_json: string;
  raw_text: string;
  source_url: string;
  content_hash: string;
  collected_at: string;
  first_seen_at: string;
  last_seen_at: string;
};

type JobCollectionRunRow = {
  id: string;
  status: string;
  sources_json: string;
  keywords_json: string;
  limit_per_source: number;
  results_json: string;
  started_at: string;
  finished_at: string | null;
};

type InterviewSessionRow = {
  active_plan_id: string | null;
  active_question_id: string | null;
  preparation_error_code: string | null;
  preparation_error_message: string | null;
};

type InterviewPlanRow = {
  id: string;
  version: number;
  prompt_version: string;
  question_count: number;
  competencies_json: string;
  created_at: string;
};

type InterviewQuestionRow = {
  id: string;
  ordinal: number;
  competency: string;
  kind: string;
  difficulty: string;
  prompt: string;
};

type QuestionPracticeSessionRow = {
  id: string;
  create_operation_id: string;
  selection_kind: string;
  selection_json: string;
  status: string;
  question_count: number;
  current_ordinal: number;
  state_version: number;
  abandon_operation_id: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  abandoned_at: string | null;
};

type QuestionPracticeItemRow = {
  id: string;
  session_id: string;
  ordinal: number;
  question_id: string;
  question_version_id: string;
  stable_key: string;
  version: number;
  title: string;
  difficulty: string;
  status: string;
  snapshot_json: string;
  snapshot_hash: string;
  draft_answer: string;
  draft_revision: number;
  draft_elapsed_seconds: number;
  draft_saved_at: string | null;
  skip_operation_id: string | null;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
};

type QuestionPracticeAttemptRow = {
  id: string;
  item_id: string;
  submit_operation_id: string;
  answer_text: string;
  answer_hash: string;
  elapsed_seconds: number;
  self_rating: string | null;
  covered_rubric_ids_json: string;
  self_note: string;
  review_operation_id: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

type QuestionPracticeSnapshotRecord = {
  questionId: string;
  questionVersionId: string;
  stableKey: string;
  version: number;
  title: string;
  prompt: string;
  kind: InterviewQuestionKind;
  difficulty: InterviewQuestionDifficulty;
  roles: string[];
  seniority: string[];
  competencies: string[];
  skills: string[];
  estimatedSeconds: number;
  review: {
    intent: string;
    answerOutline: string[];
    rubric: QuestionBankQuestionDetail["rubric"];
    commonMistakes: string[];
    followUps: QuestionBankQuestionDetail["followUps"];
    source: QuestionBankQuestionDetail["source"];
  };
};

export type InterviewPlanQuestionInput = {
  ordinal: number;
  competency: string;
  kind: InterviewQuestionKind;
  difficulty: InterviewQuestionDifficulty;
  prompt: string;
  rubric: string[];
};

export type InterviewModelInvocationCompletion = {
  providerId: string;
  modelId: string;
  requestHash: string;
  responseHash: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  durationMs: number;
};

export type InterviewModelInvocationFailure = {
  errorCode: string;
  errorMessage: string;
  providerId?: string;
  modelId?: string;
  requestHash?: string;
  responseHash?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  durationMs: number;
};

export type InterviewPreparationClaim = "claimed" | "already_running" | "already_completed";

export const QUESTION_SOURCE_KINDS = ["builtin", "file", "web", "manual", "generated"] as const;
export type QuestionSourceKind = QuestionBankSourceType;

export const QUESTION_BANK_STATUSES = ["draft", "reviewing", "published", "deprecated"] as const;
export type QuestionBankStatus = QuestionBankApiStatus;

export const QUESTION_TAG_AXES = ["role", "level", "skill", "competency", "topic", "subtype"] as const;
export type QuestionTagAxis = typeof QUESTION_TAG_AXES[number];

export type QuestionBankSourceInput = {
  /** A package-local key used by question source references. */
  key: string;
  kind: QuestionSourceKind;
  title: string;
  uri?: string;
  mimeType?: string;
  parserId?: string;
  parserVersion?: string;
  /** Hash of the original document/page, not of the parsed questions. */
  contentHash?: string;
  metadata?: Record<string, unknown>;
};

export type QuestionBankTagInput = {
  axis: QuestionTagAxis;
  key: string;
  label: string;
};

export type QuestionBankRubricInput = {
  id?: string;
  criterion: string;
  description?: string;
  weight?: number;
  required?: boolean;
};

export type QuestionBankFollowupInput = {
  prompt: string;
  trigger?: string;
};

export type QuestionBankQuestionInput = {
  /** Stable across package revisions; updates create an immutable new version. */
  stableKey: string;
  /** Source-owned revision. Explicit revisions prevent an older import from replacing a newer one. */
  version?: number;
  status?: QuestionBankStatus;
  title: string;
  prompt: string;
  kind: InterviewQuestionKind;
  difficulty: InterviewQuestionDifficulty;
  answerOutline: string[];
  commonMistakes?: string[];
  alternativeAnswers?: string[];
  estimatedDurationSeconds?: number;
  metadata?: Record<string, unknown>;
  tags: QuestionBankTagInput[];
  rubric: QuestionBankRubricInput[];
  followups?: QuestionBankFollowupInput[];
  sources?: Array<{
    sourceKey: string;
    /** Page, heading, CSS selector, text range, or other parser-specific location. */
    locator?: Record<string, unknown>;
  }>;
};

export type QuestionBankPackageInput = {
  packageId: string;
  packageVersion: string;
  /** Optional hash of the original package. A canonical payload hash is used otherwise. */
  contentHash?: string;
  sources: QuestionBankSourceInput[];
  questions: QuestionBankQuestionInput[];
};

export type QuestionBankImportResult = {
  importId: string;
  packageHash: string;
  inserted: number;
  updated: number;
  unchanged: number;
  alreadyImported: boolean;
};

export type QuestionBankCatalogImportResult = {
  packs: number;
  inserted: number;
  updated: number;
  unchanged: number;
  alreadyImported: number;
};

const SCHEMA_VERSION = 7;

const QUESTION_BANK_SCHEMA_SQL = `
  CREATE TABLE question_bank_items (
    id TEXT PRIMARY KEY,
    stable_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('draft', 'reviewing', 'published', 'deprecated')),
    current_version_id TEXT REFERENCES question_versions(id),
    published_version_id TEXT REFERENCES question_versions(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX question_bank_items_status_updated_idx
  ON question_bank_items(status, updated_at DESC);

  CREATE TABLE question_versions (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES question_bank_items(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    status TEXT NOT NULL CHECK (status IN ('draft', 'reviewing', 'published', 'deprecated')),
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('technical', 'project', 'behavioral', 'scenario')),
    difficulty TEXT NOT NULL CHECK (difficulty IN ('introductory', 'intermediate', 'advanced')),
    answer_outline_json TEXT NOT NULL DEFAULT '[]',
    common_mistakes_json TEXT NOT NULL DEFAULT '[]',
    alternative_answers_json TEXT NOT NULL DEFAULT '[]',
    estimated_duration_seconds INTEGER CHECK (estimated_duration_seconds IS NULL OR estimated_duration_seconds > 0),
    metadata_json TEXT NOT NULL DEFAULT '{}',
    search_text TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(question_id, version)
  ) STRICT;

  CREATE INDEX question_versions_question_idx
  ON question_versions(question_id, version DESC);

  CREATE VIRTUAL TABLE question_versions_fts USING fts5(
    title,
    prompt,
    answer_outline_json,
    common_mistakes_json,
    search_text,
    content='question_versions',
    content_rowid='rowid',
    tokenize='trigram'
  );

  CREATE TRIGGER question_versions_ai AFTER INSERT ON question_versions BEGIN
    INSERT INTO question_versions_fts(
      rowid, title, prompt, answer_outline_json, common_mistakes_json, search_text
    ) VALUES (
      new.rowid, new.title, new.prompt, new.answer_outline_json, new.common_mistakes_json, new.search_text
    );
  END;
  CREATE TRIGGER question_versions_ad AFTER DELETE ON question_versions BEGIN
    INSERT INTO question_versions_fts(
      question_versions_fts, rowid, title, prompt, answer_outline_json, common_mistakes_json, search_text
    ) VALUES (
      'delete', old.rowid, old.title, old.prompt, old.answer_outline_json, old.common_mistakes_json, old.search_text
    );
  END;
  CREATE TRIGGER question_versions_au AFTER UPDATE ON question_versions BEGIN
    INSERT INTO question_versions_fts(
      question_versions_fts, rowid, title, prompt, answer_outline_json, common_mistakes_json, search_text
    ) VALUES (
      'delete', old.rowid, old.title, old.prompt, old.answer_outline_json, old.common_mistakes_json, old.search_text
    );
    INSERT INTO question_versions_fts(
      rowid, title, prompt, answer_outline_json, common_mistakes_json, search_text
    ) VALUES (
      new.rowid, new.title, new.prompt, new.answer_outline_json, new.common_mistakes_json, new.search_text
    );
  END;

  CREATE TABLE question_sources (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('builtin', 'file', 'web', 'manual', 'generated')),
    title TEXT NOT NULL,
    uri TEXT,
    mime_type TEXT,
    parser_id TEXT,
    parser_version TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    content_hash TEXT NOT NULL,
    fingerprint TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX question_sources_kind_idx ON question_sources(kind, created_at DESC);
  CREATE INDEX question_sources_uri_idx ON question_sources(uri) WHERE uri IS NOT NULL;

  CREATE TABLE question_version_sources (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES question_sources(id),
    locator_json TEXT NOT NULL DEFAULT '{}',
    locator_hash TEXT NOT NULL,
    UNIQUE(version_id, source_id, locator_hash)
  ) STRICT;

  CREATE INDEX question_version_sources_source_idx
  ON question_version_sources(source_id, version_id);

  CREATE TABLE question_tags (
    id TEXT PRIMARY KEY,
    axis TEXT NOT NULL CHECK (axis IN ('role', 'level', 'skill', 'competency', 'topic', 'subtype')),
    tag_key TEXT NOT NULL,
    label TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(axis, tag_key)
  ) STRICT;

  CREATE INDEX question_tags_axis_label_idx ON question_tags(axis, label);

  CREATE TABLE question_version_tags (
    version_id TEXT NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES question_tags(id),
    label TEXT NOT NULL,
    PRIMARY KEY(version_id, tag_id)
  ) WITHOUT ROWID, STRICT;

  CREATE TABLE question_rubric_items (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    rubric_key TEXT NOT NULL,
    criterion TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    weight REAL NOT NULL DEFAULT 1 CHECK (weight >= 0),
    required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1)),
    UNIQUE(version_id, ordinal),
    UNIQUE(version_id, rubric_key)
  ) STRICT;

  CREATE TABLE question_followups (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    prompt TEXT NOT NULL,
    trigger_text TEXT,
    UNIQUE(version_id, ordinal)
  ) STRICT;

  CREATE TABLE question_user_state (
    question_id TEXT PRIMARY KEY REFERENCES question_bank_items(id) ON DELETE CASCADE,
    is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
    favorite_at TEXT,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX question_user_state_favorite_idx
  ON question_user_state(is_favorite, updated_at DESC);

  CREATE TABLE question_imports (
    id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL,
    package_version TEXT NOT NULL,
    package_hash TEXT NOT NULL,
    source_ids_json TEXT NOT NULL DEFAULT '[]',
    question_count INTEGER NOT NULL CHECK (question_count > 0),
    inserted_count INTEGER NOT NULL CHECK (inserted_count >= 0),
    updated_count INTEGER NOT NULL CHECK (updated_count >= 0),
    unchanged_count INTEGER NOT NULL CHECK (unchanged_count >= 0),
    imported_at TEXT NOT NULL,
    UNIQUE(package_id, package_version)
  ) STRICT;

  CREATE INDEX question_imports_package_idx
  ON question_imports(package_id, imported_at DESC);
`;

const QUESTION_PRACTICE_SCHEMA_SQL = `
  CREATE TABLE question_practice_sessions (
    id TEXT PRIMARY KEY,
    create_operation_id TEXT NOT NULL UNIQUE,
    selection_kind TEXT NOT NULL CHECK (selection_kind IN ('single', 'filtered')),
    selection_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')),
    question_count INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 100),
    current_ordinal INTEGER NOT NULL DEFAULT 0 CHECK (current_ordinal >= 0),
    state_version INTEGER NOT NULL DEFAULT 0 CHECK (state_version >= 0),
    abandon_operation_id TEXT UNIQUE,
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    abandoned_at TEXT
  ) STRICT;

  CREATE UNIQUE INDEX question_practice_sessions_one_active_idx
  ON question_practice_sessions((1)) WHERE status = 'active';

  CREATE INDEX question_practice_sessions_history_idx
  ON question_practice_sessions(updated_at DESC, id);

  CREATE TABLE question_practice_items (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES question_practice_sessions(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    question_id TEXT NOT NULL,
    question_version_id TEXT NOT NULL,
    stable_key TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    title TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('introductory', 'intermediate', 'advanced')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'answering', 'reviewing', 'completed', 'skipped')),
    snapshot_json TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    draft_answer TEXT NOT NULL DEFAULT '',
    draft_revision INTEGER NOT NULL DEFAULT 0 CHECK (draft_revision >= 0),
    draft_elapsed_seconds INTEGER NOT NULL DEFAULT 0 CHECK (draft_elapsed_seconds BETWEEN 0 AND 604800),
    draft_saved_at TEXT,
    skip_operation_id TEXT UNIQUE,
    started_at TEXT,
    submitted_at TEXT,
    completed_at TEXT,
    UNIQUE(session_id, ordinal),
    UNIQUE(session_id, question_id)
  ) STRICT;

  CREATE INDEX question_practice_items_session_idx
  ON question_practice_items(session_id, ordinal);

  CREATE TABLE question_practice_attempts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES question_practice_sessions(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL UNIQUE REFERENCES question_practice_items(id) ON DELETE CASCADE,
    submit_operation_id TEXT NOT NULL UNIQUE,
    answer_text TEXT NOT NULL,
    answer_hash TEXT NOT NULL,
    elapsed_seconds INTEGER NOT NULL CHECK (elapsed_seconds >= 0),
    self_rating TEXT CHECK (self_rating IS NULL OR self_rating IN ('needs_review', 'developing', 'mastered')),
    covered_rubric_ids_json TEXT NOT NULL DEFAULT '[]',
    self_note TEXT NOT NULL DEFAULT '',
    review_operation_id TEXT UNIQUE,
    submitted_at TEXT NOT NULL,
    reviewed_at TEXT
  ) STRICT;

  CREATE INDEX question_practice_attempts_session_idx
  ON question_practice_attempts(session_id, submitted_at);

  CREATE TABLE question_practice_progress (
    stable_key TEXT PRIMARY KEY,
    latest_question_id TEXT NOT NULL,
    latest_version INTEGER NOT NULL CHECK (latest_version > 0),
    practice_count INTEGER NOT NULL DEFAULT 0 CHECK (practice_count >= 0),
    last_rating TEXT NOT NULL CHECK (last_rating IN ('needs_review', 'developing', 'mastered')),
    best_rating TEXT NOT NULL CHECK (best_rating IN ('needs_review', 'developing', 'mastered')),
    review_status TEXT NOT NULL CHECK (review_status IN ('learning', 'review', 'mastered')),
    last_practiced_at TEXT NOT NULL,
    next_review_at TEXT,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX question_practice_progress_due_idx
  ON question_practice_progress(next_review_at) WHERE next_review_at IS NOT NULL;
`;

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
    .join(",")}}`;
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label}不能为空`);
  return normalized;
}

function normalizeOptionalText(value: string | undefined): string {
  return value?.trim() ?? "";
}

function normalizeTextArray(value: string[] | undefined, label: string): string[] {
  if (!value) return [];
  return value.map((item, index) => requiredText(item, `${label}[${index}]`));
}

function parseCompetencies(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function asStatus(value: string): InterviewStatus {
  return INTERVIEW_STATUSES.includes(value as InterviewStatus) ? value as InterviewStatus : "draft";
}

function mapInterview(row: InterviewRow): InterviewListItem {
  return {
    id: row.id,
    title: row.title,
    candidateName: row.candidate_name,
    positionTitle: row.position_title,
    status: asStatus(row.status),
    currentQuestionIndex: row.current_question_index,
    questionCount: row.question_count,
    competencies: parseCompetencies(row.competencies_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDocument(row: DocumentRow): InterviewDocument {
  return {
    id: row.id,
    interviewId: row.interview_id,
    kind: row.kind as InterviewDocumentKind,
    title: row.title,
    content: row.content,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function parseQuestionPracticeSnapshot(value: string): QuestionPracticeSnapshotRecord {
  try {
    const parsed = JSON.parse(value) as Partial<QuestionPracticeSnapshotRecord>;
    if (!parsed || typeof parsed !== "object"
      || typeof parsed.questionId !== "string"
      || typeof parsed.questionVersionId !== "string"
      || typeof parsed.stableKey !== "string"
      || !Number.isSafeInteger(parsed.version)
      || typeof parsed.title !== "string"
      || typeof parsed.prompt !== "string"
      || !INTERVIEW_QUESTION_KINDS.includes(parsed.kind as InterviewQuestionKind)
      || !INTERVIEW_QUESTION_DIFFICULTIES.includes(parsed.difficulty as InterviewQuestionDifficulty)
      || !Array.isArray(parsed.roles)
      || !Array.isArray(parsed.seniority)
      || !Array.isArray(parsed.competencies)
      || !Array.isArray(parsed.skills)
      || typeof parsed.review !== "object"
      || parsed.review === null
      || !Array.isArray(parsed.review.answerOutline)
      || !Array.isArray(parsed.review.rubric)
      || !Array.isArray(parsed.review.commonMistakes)
      || !Array.isArray(parsed.review.followUps)
      || typeof parsed.review.source !== "object"
      || parsed.review.source === null) {
      throw new Error("invalid snapshot");
    }
    return parsed as QuestionPracticeSnapshotRecord;
  } catch {
    throw new Error("练习题快照损坏，无法恢复该练习");
  }
}

function questionPracticeRatingRank(rating: QuestionPracticeSelfRating): number {
  if (rating === "needs_review") return 0;
  if (rating === "developing") return 1;
  return 2;
}

function questionPracticeReviewState(rating: QuestionPracticeSelfRating, nowValue: string): {
  reviewStatus: "learning" | "review" | "mastered";
  nextReviewAt: string | null;
} {
  if (rating === "needs_review") {
    return { reviewStatus: "learning", nextReviewAt: nowValue };
  }
  if (rating === "developing") {
    const next = new Date(nowValue);
    next.setUTCDate(next.getUTCDate() + 7);
    return { reviewStatus: "review", nextReviewAt: next.toISOString() };
  }
  return { reviewStatus: "mastered", nextReviewAt: null };
}

function mapJobPosting(row: JobPostingRow): JobPosting {
  return {
    id: row.id,
    source: row.source as JobSource,
    sourceJobId: row.source_job_id,
    sourceCode: row.source_code,
    company: row.company,
    title: row.title,
    city: row.city,
    jobType: row.job_type,
    category: row.category,
    batch: row.batch,
    department: row.department,
    description: row.description,
    responsibilities: parseStringArray(row.responsibilities_json),
    requirements: parseStringArray(row.requirements_json),
    rawText: row.raw_text,
    sourceUrl: row.source_url,
    collectedAt: row.collected_at,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}

function mapCollectionRun(row: JobCollectionRunRow): JobCollectionRun {
  let results: JobCollectionSourceResult[] = [];
  try {
    const parsed = JSON.parse(row.results_json) as unknown;
    if (Array.isArray(parsed)) results = parsed as JobCollectionSourceResult[];
  } catch {
    // An incomplete result should not make the whole job library unreadable.
  }
  return {
    id: row.id,
    status: row.status as JobCollectionStatus,
    sources: parseStringArray(row.sources_json) as JobSource[],
    keywords: parseStringArray(row.keywords_json),
    limitPerSource: row.limit_per_source,
    results,
    startedAt: row.started_at,
    ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
  };
}

function mapPlanSummary(row: InterviewPlanRow): InterviewPlanSummary {
  return {
    id: row.id,
    version: row.version,
    promptVersion: row.prompt_version,
    questionCount: row.question_count,
    competencies: parseCompetencies(row.competencies_json),
    createdAt: row.created_at,
  };
}

function mapCurrentQuestion(row: InterviewQuestionRow, total: number): InterviewCurrentQuestion {
  return {
    id: row.id,
    ordinal: row.ordinal,
    total,
    competency: row.competency,
    kind: row.kind as InterviewQuestionKind,
    difficulty: row.difficulty as InterviewQuestionDifficulty,
    prompt: row.prompt,
  };
}

export class InterviewDatabase {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    try {
      this.database.exec("PRAGMA foreign_keys = ON");
      this.database.exec("PRAGMA busy_timeout = 5000");
      this.database.exec("PRAGMA journal_mode = WAL");
      this.migrate();
      this.database.prepare(`
        UPDATE job_collection_runs
        SET status = 'failed', finished_at = COALESCE(finished_at, ?)
        WHERE status = 'running'
      `).run(new Date().toISOString());
      this.recoverInterruptedPreparation();
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }

  createInterview(request: InterviewCreateRequest): InterviewRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    const title = request.title?.trim() || `${request.positionTitle} · ${request.candidateName}`;
    const documents: Array<{ kind: InterviewDocumentKind; title: string; content: string }> = [
      { kind: "job_description", title: `${request.positionTitle}岗位描述`, content: request.jobDescription },
      { kind: "resume", title: `${request.candidateName}的简历`, content: request.resumeText },
    ];

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`
        INSERT INTO interviews (
          id, title, candidate_name, position_title, status, current_question_index,
          question_count, competencies_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'draft', 0, ?, ?, ?, ?)
      `).run(
        id,
        title,
        request.candidateName,
        request.positionTitle,
        request.questionCount,
        JSON.stringify(request.competencies),
        now,
        now,
      );

      const insertDocument = this.database.prepare(`
        INSERT INTO interview_documents (
          id, interview_id, kind, title, content, content_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const document of documents) {
        insertDocument.run(
          randomUUID(),
          id,
          document.kind,
          document.title,
          document.content,
          hashContent(document.content),
          now,
          now,
        );
      }

      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    const interview = this.getInterview(id);
    if (!interview) throw new Error("面试草稿创建后无法读取");
    return interview;
  }

  getInterview(id: string): InterviewRecord | null {
    const row = this.database.prepare(`
      SELECT id, title, candidate_name, position_title, status, current_question_index,
             question_count, competencies_json, created_at, updated_at
      FROM interviews
      WHERE id = ?
    `).get(id) as InterviewRow | undefined;
    if (!row) return null;

    const documentRows = this.database.prepare(`
      SELECT id, interview_id, kind, title, content, content_hash, created_at, updated_at
      FROM interview_documents
      WHERE interview_id = ?
      ORDER BY CASE kind WHEN 'job_description' THEN 0 WHEN 'resume' THEN 1 ELSE 2 END, created_at
    `).all(id) as unknown as DocumentRow[];

    return { ...mapInterview(row), documents: documentRows.map(mapDocument) };
  }

  listInterviews(): InterviewListItem[] {
    const rows = this.database.prepare(`
      SELECT id, title, candidate_name, position_title, status, current_question_index,
             question_count, competencies_json, created_at, updated_at
      FROM interviews
      ORDER BY updated_at DESC, rowid DESC
    `).all() as unknown as InterviewRow[];
    return rows.map(mapInterview);
  }

  getSnapshot(): InterviewSnapshot {
    const interviews = this.listInterviews();
    const counts = Object.fromEntries(INTERVIEW_STATUSES.map((status) => [status, 0])) as Record<InterviewStatus, number>;
    for (const interview of interviews) counts[interview.status] += 1;
    return { interviews, counts };
  }

  getInterviewSession(id: string): InterviewSession | null {
    const interview = this.getInterview(id);
    if (!interview) return null;
    const sessionRow = this.database.prepare(`
      SELECT active_plan_id, active_question_id, preparation_error_code, preparation_error_message
      FROM interviews
      WHERE id = ?
    `).get(id) as InterviewSessionRow;
    const planRow = sessionRow.active_plan_id
      ? this.database.prepare(`
          SELECT id, version, prompt_version, question_count, competencies_json, created_at
          FROM interview_plans
          WHERE id = ? AND interview_id = ?
        `).get(sessionRow.active_plan_id, id) as InterviewPlanRow | undefined
      : undefined;
    const questionRow = sessionRow.active_question_id
      ? this.database.prepare(`
          SELECT id, ordinal, competency, kind, difficulty, prompt
          FROM interview_questions
          WHERE id = ? AND interview_id = ?
        `).get(sessionRow.active_question_id, id) as InterviewQuestionRow | undefined
      : undefined;
    const answered = this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM interview_turns
      WHERE interview_id = ? AND role = 'candidate' AND question_id IS NOT NULL
    `).get(id) as { count: number };
    const plan = planRow ? mapPlanSummary(planRow) : null;
    return {
      interview,
      plan,
      currentQuestion: questionRow ? mapCurrentQuestion(questionRow, plan?.questionCount ?? interview.questionCount) : null,
      answeredCount: Number(answered.count),
      preparationError: sessionRow.preparation_error_code && sessionRow.preparation_error_message
        ? { code: sessionRow.preparation_error_code, message: sessionRow.preparation_error_message }
        : null,
    };
  }

  claimInterviewPreparation(
    interviewId: string,
    operationId: string,
    promptVersion: string,
  ): InterviewPreparationClaim {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const existingInvocation = this.database.prepare(`
        SELECT status
        FROM model_invocations
        WHERE interview_id = ? AND operation_id = ? AND purpose = 'prepare_questions'
      `).get(interviewId, operationId) as { status: string } | undefined;
      if (existingInvocation?.status === "succeeded") {
        this.database.exec("COMMIT");
        return "already_completed";
      }
      if (existingInvocation?.status === "running") {
        this.database.exec("COMMIT");
        return "already_running";
      }
      if (existingInvocation) throw new Error("该准备操作已经失败，请重新发起");

      const row = this.database.prepare(`
        SELECT status, active_operation_id
        FROM interviews
        WHERE id = ?
      `).get(interviewId) as { status: string; active_operation_id: string | null } | undefined;
      if (!row) throw new Error("面试不存在");
      if (row.status === "preparing") {
        if (row.active_operation_id === operationId) {
          this.database.exec("COMMIT");
          return "already_running";
        }
        throw new Error("该面试正在准备中");
      }
      if (row.status !== "draft" && row.status !== "ready") {
        throw new Error("当前状态不能重新准备面试");
      }

      const now = new Date().toISOString();
      this.database.prepare(`
        INSERT INTO model_invocations (
          id, interview_id, operation_id, purpose, status, prompt_version,
          request_hash, response_hash, started_at
        ) VALUES (?, ?, ?, 'prepare_questions', 'running', ?, '', '', ?)
      `).run(randomUUID(), interviewId, operationId, promptVersion, now);
      this.database.prepare(`
        UPDATE interviews
        SET status = 'preparing', active_operation_id = ?,
            preparation_error_code = NULL, preparation_error_message = NULL,
            state_version = state_version + 1, updated_at = ?
        WHERE id = ?
      `).run(operationId, now, interviewId);
      this.database.exec("COMMIT");
      return "claimed";
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  completeInterviewPreparation(input: {
    interviewId: string;
    operationId: string;
    promptVersion: string;
    competencies: string[];
    jobDescriptionHash: string;
    resumeHash: string;
    questions: InterviewPlanQuestionInput[];
    invocation: InterviewModelInvocationCompletion;
  }): InterviewSession {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const interview = this.database.prepare(`
        SELECT status, active_operation_id, question_count, competencies_json
        FROM interviews
        WHERE id = ?
      `).get(input.interviewId) as {
        status: string;
        active_operation_id: string | null;
        question_count: number;
        competencies_json: string;
      } | undefined;
      if (!interview) throw new Error("面试不存在");
      if (interview.status !== "preparing" || interview.active_operation_id !== input.operationId) {
        throw new Error("准备操作已失效，结果未保存");
      }
      const expectedCompetencies = parseCompetencies(interview.competencies_json);
      if (input.questions.length !== interview.question_count) throw new Error("面试题目数量与草稿配置不一致");
      if (JSON.stringify(input.competencies) !== JSON.stringify(expectedCompetencies)) {
        throw new Error("面试能力维度与草稿配置不一致");
      }
      if (input.questions.some((question, index) => question.ordinal !== index)) {
        throw new Error("面试题目顺序无效");
      }

      const invocationRow = this.database.prepare(`
        SELECT id
        FROM model_invocations
        WHERE interview_id = ? AND operation_id = ? AND purpose = 'prepare_questions' AND status = 'running'
      `).get(input.interviewId, input.operationId) as { id: string } | undefined;
      if (!invocationRow) throw new Error("找不到正在执行的模型调用");

      const nextVersionRow = this.database.prepare(`
        SELECT COALESCE(MAX(version), 0) + 1 AS version
        FROM interview_plans
        WHERE interview_id = ?
      `).get(input.interviewId) as { version: number };
      const planId = randomUUID();
      const now = new Date().toISOString();
      this.database.prepare(`
        UPDATE model_invocations
        SET status = 'succeeded', provider_id = ?, model_id = ?, request_hash = ?, response_hash = ?,
            input_tokens = ?, output_tokens = ?, total_tokens = ?, cached_input_tokens = ?,
            reasoning_tokens = ?, cost_usd = ?, duration_ms = ?, finished_at = ?
        WHERE id = ?
      `).run(
        input.invocation.providerId,
        input.invocation.modelId,
        input.invocation.requestHash,
        input.invocation.responseHash,
        input.invocation.inputTokens ?? null,
        input.invocation.outputTokens ?? null,
        input.invocation.totalTokens ?? null,
        input.invocation.cachedInputTokens ?? null,
        input.invocation.reasoningTokens ?? null,
        input.invocation.costUsd ?? null,
        input.invocation.durationMs,
        now,
        invocationRow.id,
      );
      this.database.prepare(`
        INSERT INTO interview_plans (
          id, interview_id, version, operation_id, prompt_version, model_invocation_id,
          question_count, competencies_json, job_description_hash, resume_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        planId,
        input.interviewId,
        nextVersionRow.version,
        input.operationId,
        input.promptVersion,
        invocationRow.id,
        input.questions.length,
        JSON.stringify(input.competencies),
        input.jobDescriptionHash,
        input.resumeHash,
        now,
      );
      const insertQuestion = this.database.prepare(`
        INSERT INTO interview_questions (
          id, interview_id, plan_id, ordinal, competency, kind, difficulty, prompt, rubric_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const question of input.questions) {
        insertQuestion.run(
          randomUUID(),
          input.interviewId,
          planId,
          question.ordinal,
          question.competency,
          question.kind,
          question.difficulty,
          question.prompt,
          JSON.stringify(question.rubric),
          now,
        );
      }
      this.database.prepare(`
        UPDATE interviews
        SET status = 'ready', active_plan_id = ?, active_question_id = NULL,
            active_operation_id = NULL, current_question_index = 0,
            preparation_error_code = NULL, preparation_error_message = NULL,
            state_version = state_version + 1, updated_at = ?
        WHERE id = ?
      `).run(planId, now, input.interviewId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    const session = this.getInterviewSession(input.interviewId);
    if (!session) throw new Error("面试计划保存后无法读取");
    return session;
  }

  failInterviewPreparation(
    interviewId: string,
    operationId: string,
    failure: InterviewModelInvocationFailure,
  ): InterviewSession {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database.prepare(`
        SELECT status, active_operation_id, active_plan_id
        FROM interviews
        WHERE id = ?
      `).get(interviewId) as {
        status: string;
        active_operation_id: string | null;
        active_plan_id: string | null;
      } | undefined;
      if (!row) throw new Error("面试不存在");
      if (row.status === "preparing" && row.active_operation_id === operationId) {
        const now = new Date().toISOString();
        this.database.prepare(`
          UPDATE model_invocations
          SET status = 'failed', provider_id = ?, model_id = ?,
              request_hash = COALESCE(?, request_hash), response_hash = COALESCE(?, response_hash),
              input_tokens = ?, output_tokens = ?, total_tokens = ?, cached_input_tokens = ?,
              reasoning_tokens = ?, cost_usd = ?,
              error_code = ?, error_message = ?, duration_ms = ?, finished_at = ?
          WHERE interview_id = ? AND operation_id = ? AND purpose = 'prepare_questions' AND status = 'running'
        `).run(
          failure.providerId ?? null,
          failure.modelId ?? null,
          failure.requestHash ?? null,
          failure.responseHash ?? null,
          failure.inputTokens ?? null,
          failure.outputTokens ?? null,
          failure.totalTokens ?? null,
          failure.cachedInputTokens ?? null,
          failure.reasoningTokens ?? null,
          failure.costUsd ?? null,
          failure.errorCode,
          failure.errorMessage,
          failure.durationMs,
          now,
          interviewId,
          operationId,
        );
        this.database.prepare(`
          UPDATE interviews
          SET status = ?, active_operation_id = NULL,
              preparation_error_code = ?, preparation_error_message = ?,
              state_version = state_version + 1, updated_at = ?
          WHERE id = ?
        `).run(row.active_plan_id ? "ready" : "draft", failure.errorCode, failure.errorMessage, now, interviewId);
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    const session = this.getInterviewSession(interviewId);
    if (!session) throw new Error("面试准备失败后无法读取");
    return session;
  }

  getJobLibrary(limit = 1_000): JobLibrarySnapshot {
    const safeLimit = Math.max(1, Math.min(5_000, Math.trunc(limit)));
    const rows = this.database.prepare(`
      SELECT id, source, source_job_id, source_code, company, title, city, job_type,
             category, batch, department, description, responsibilities_json,
             requirements_json, raw_text, source_url, content_hash, collected_at,
             first_seen_at, last_seen_at
      FROM job_postings
      ORDER BY last_seen_at DESC, rowid DESC
      LIMIT ?
    `).all(safeLimit) as unknown as JobPostingRow[];
    const countRows = this.database.prepare(`
      SELECT source, COUNT(*) AS count
      FROM job_postings
      GROUP BY source
    `).all() as unknown as Array<{ source: JobSource; count: number }>;
    const bySource: Record<JobSource, number> = { alibaba: 0, bytedance: 0 };
    for (const row of countRows) {
      if (row.source === "alibaba" || row.source === "bytedance") bySource[row.source] = Number(row.count);
    }
    const total = bySource.alibaba + bySource.bytedance;
    const runRow = this.database.prepare(`
      SELECT id, status, sources_json, keywords_json, limit_per_source, results_json, started_at, finished_at
      FROM job_collection_runs
      ORDER BY started_at DESC, rowid DESC
      LIMIT 1
    `).get() as JobCollectionRunRow | undefined;
    return { jobs: rows.map(mapJobPosting), total, bySource, lastRun: runRow ? mapCollectionRun(runRow) : null };
  }

  startJobCollection(request: JobCollectionRequest): JobCollectionRun {
    const run: JobCollectionRun = {
      id: randomUUID(),
      status: "running",
      sources: request.sources,
      keywords: request.keywords,
      limitPerSource: request.limitPerSource,
      results: [],
      startedAt: new Date().toISOString(),
    };
    this.database.prepare(`
      INSERT INTO job_collection_runs (
        id, status, sources_json, keywords_json, limit_per_source, results_json, started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, '[]', ?, NULL)
    `).run(
      run.id,
      run.status,
      JSON.stringify(run.sources),
      JSON.stringify(run.keywords),
      run.limitPerSource,
      run.startedAt,
    );
    return run;
  }

  finishJobCollection(
    id: string,
    status: Exclude<JobCollectionStatus, "running">,
    results: JobCollectionSourceResult[],
  ): JobCollectionRun {
    const finishedAt = new Date().toISOString();
    this.database.prepare(`
      UPDATE job_collection_runs
      SET status = ?, results_json = ?, finished_at = ?
      WHERE id = ?
    `).run(status, JSON.stringify(results), finishedAt, id);
    const row = this.database.prepare(`
      SELECT id, status, sources_json, keywords_json, limit_per_source, results_json, started_at, finished_at
      FROM job_collection_runs
      WHERE id = ?
    `).get(id) as JobCollectionRunRow | undefined;
    if (!row) throw new Error("采集记录完成后无法读取");
    return mapCollectionRun(row);
  }

  upsertJobPostings(jobs: CollectedJobPosting[]): { inserted: number; updated: number; unchanged: number } {
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const findExisting = this.database.prepare(`
      SELECT content_hash FROM job_postings WHERE source = ? AND source_job_id = ?
    `);
    const insert = this.database.prepare(`
      INSERT INTO job_postings (
        id, source, source_job_id, source_code, company, title, city, job_type,
        category, batch, department, description, responsibilities_json,
        requirements_json, raw_text, source_url, content_hash, collected_at,
        first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const update = this.database.prepare(`
      UPDATE job_postings SET
        source_code = ?, company = ?, title = ?, city = ?, job_type = ?, category = ?,
        batch = ?, department = ?, description = ?, responsibilities_json = ?,
        requirements_json = ?, raw_text = ?, source_url = ?, content_hash = ?,
        collected_at = ?, last_seen_at = ?
      WHERE source = ? AND source_job_id = ?
    `);

    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const job of jobs) {
        const contentHash = hashContent(job.rawText);
        const existing = findExisting.get(job.source, job.sourceJobId) as { content_hash: string } | undefined;
        const now = new Date().toISOString();
        if (!existing) {
          insert.run(
            randomUUID(), job.source, job.sourceJobId, job.sourceCode, job.company, job.title,
            job.city, job.jobType, job.category, job.batch, job.department, job.description,
            JSON.stringify(job.responsibilities), JSON.stringify(job.requirements), job.rawText,
            job.sourceUrl, contentHash, job.collectedAt, now, now,
          );
          inserted += 1;
          continue;
        }
        update.run(
          job.sourceCode, job.company, job.title, job.city, job.jobType, job.category,
          job.batch, job.department, job.description, JSON.stringify(job.responsibilities),
          JSON.stringify(job.requirements), job.rawText, job.sourceUrl, contentHash,
          job.collectedAt, now, job.source, job.sourceJobId,
        );
        if (existing.content_hash === contentHash) unchanged += 1;
        else updated += 1;
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return { inserted, updated, unchanged };
  }

  importQuestionBankCatalog(catalog: LoadedQuestionBankCatalog): QuestionBankCatalogImportResult {
    const result: QuestionBankCatalogImportResult = {
      packs: catalog.packs.length,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      alreadyImported: 0,
    };
    const nested = this.database.isTransaction;
    this.database.exec(nested ? "SAVEPOINT question_catalog_import" : "BEGIN IMMEDIATE");
    try {
      for (const pack of catalog.packs) {
        const imported = this.importQuestionBankPack(pack);
        result.inserted += imported.inserted;
        result.updated += imported.updated;
        result.unchanged += imported.unchanged;
        if (imported.alreadyImported) result.alreadyImported += 1;
      }
      this.database.exec(nested ? "RELEASE SAVEPOINT question_catalog_import" : "COMMIT");
    } catch (error) {
      if (nested) {
        this.database.exec("ROLLBACK TO SAVEPOINT question_catalog_import");
        this.database.exec("RELEASE SAVEPOINT question_catalog_import");
      } else {
        this.database.exec("ROLLBACK");
      }
      throw error;
    }
    return result;
  }

  importQuestionBankPack(pack: QuestionBankPack): QuestionBankImportResult {
    const sources: QuestionBankSourceInput[] = [];
    const questions: QuestionBankQuestionInput[] = pack.questions.map((question, index) => {
      const sourceKey = `question-${index}`;
      sources.push({
        key: sourceKey,
        kind: question.source.kind,
        title: question.source.title ?? pack.pack.source.title ?? pack.pack.title,
        uri: question.source.locator,
        mimeType: "application/json",
        parserId: "question-bank-pack",
        parserVersion: String(pack.schemaVersion),
        contentHash: question.contentHash,
        metadata: {
          packageId: pack.pack.id,
          packageVersion: pack.pack.version,
          locale: pack.pack.locale,
          ...(question.source.publishedAt ? { publishedAt: question.source.publishedAt } : {}),
          ...(question.source.license ? { license: question.source.license } : {}),
        },
      });
      return {
        stableKey: question.stableKey,
        version: question.version,
        status: question.status,
        title: question.title,
        prompt: question.prompt,
        kind: question.kind,
        difficulty: question.difficulty,
        answerOutline: question.answerOutline,
        commonMistakes: question.commonMistakes,
        estimatedDurationSeconds: question.estimatedSeconds,
        metadata: {
          intent: question.intent,
          subtype: question.subtype,
          catalogVersion: question.version,
          revisionIdentity: question.revisionIdentity,
        },
        tags: [
          ...question.roles.map((key) => ({ axis: "role" as const, key, label: key })),
          ...question.seniority.map((key) => ({ axis: "level" as const, key, label: key })),
          ...question.competencies.map((key) => ({ axis: "competency" as const, key, label: key })),
          ...question.skills.map((key) => ({ axis: "skill" as const, key, label: key })),
          { axis: "subtype", key: question.subtype, label: question.subtype },
        ],
        rubric: question.rubric.map((rubric) => ({
          id: rubric.id,
          criterion: rubric.label,
          description: rubric.description,
          weight: rubric.weight,
          required: rubric.critical,
        })),
        followups: question.followUps,
        sources: [{
          sourceKey,
          locator: {
            locator: question.source.locator,
            revisionIdentity: question.revisionIdentity,
          },
        }],
      };
    });
    return this.importQuestionPackage({
      packageId: pack.pack.id,
      packageVersion: pack.pack.version,
      contentHash: pack.contentHash,
      sources,
      questions,
    });
  }

  importQuestionPackage(input: QuestionBankPackageInput): QuestionBankImportResult {
    const packageId = requiredText(input.packageId, "题包 ID");
    const packageVersion = requiredText(input.packageVersion, "题包版本");
    if (input.sources.length === 0) throw new Error("题包至少需要一个来源");
    if (input.questions.length === 0) throw new Error("题包至少需要一道题目");

    const sourceKeys = new Set<string>();
    const normalizedSources = input.sources.map((source, index) => {
      const key = requiredText(source.key, `来源[${index}] key`);
      if (sourceKeys.has(key)) throw new Error(`题包来源 key 重复: ${key}`);
      sourceKeys.add(key);
      if (!QUESTION_SOURCE_KINDS.includes(source.kind)) throw new Error(`题目来源类型无效: ${source.kind}`);
      const normalized = {
        key,
        kind: source.kind,
        title: requiredText(source.title, `来源[${index}]标题`),
        uri: normalizeOptionalText(source.uri),
        mimeType: normalizeOptionalText(source.mimeType),
        parserId: normalizeOptionalText(source.parserId),
        parserVersion: normalizeOptionalText(source.parserVersion),
        metadata: source.metadata ?? {},
        contentHash: normalizeOptionalText(source.contentHash),
      };
      const contentHash = normalized.contentHash || hashContent(stableJson({
        kind: normalized.kind,
        title: normalized.title,
        uri: normalized.uri,
        mimeType: normalized.mimeType,
        parserId: normalized.parserId,
        parserVersion: normalized.parserVersion,
        metadata: normalized.metadata,
      }));
      const fingerprint = hashContent(stableJson({
        kind: normalized.kind,
        uri: normalized.uri,
        contentHash,
        parserId: normalized.parserId,
        parserVersion: normalized.parserVersion,
      }));
      return { ...normalized, contentHash, fingerprint };
    });

    const stableKeys = new Set<string>();
    const normalizedQuestions = input.questions.map((question, index) => {
      const stableKey = requiredText(question.stableKey, `题目[${index}] stableKey`);
      if (stableKeys.has(stableKey)) throw new Error(`题包题目 stableKey 重复: ${stableKey}`);
      stableKeys.add(stableKey);
      const status = question.status ?? "published";
      if (!QUESTION_BANK_STATUSES.includes(status)) throw new Error(`题目状态无效: ${status}`);
      if (!INTERVIEW_QUESTION_KINDS.includes(question.kind)) throw new Error(`题目类型无效: ${question.kind}`);
      if (!INTERVIEW_QUESTION_DIFFICULTIES.includes(question.difficulty)) {
        throw new Error(`题目难度无效: ${question.difficulty}`);
      }
      const tags = question.tags.map((tag, tagIndex) => {
        if (!QUESTION_TAG_AXES.includes(tag.axis)) throw new Error(`题目标签轴无效: ${tag.axis}`);
        return {
          axis: tag.axis,
          key: requiredText(tag.key, `题目[${index}]标签[${tagIndex}] key`),
          label: requiredText(tag.label, `题目[${index}]标签[${tagIndex}]名称`),
        };
      });
      const uniqueTags = new Map(tags.map((tag) => [`${tag.axis}\u0000${tag.key}`, tag]));
      const rubric = question.rubric.map((item, rubricIndex) => {
        const weight = item.weight ?? 1;
        if (!Number.isFinite(weight) || weight < 0) {
          throw new Error(`题目[${index}]评分点[${rubricIndex}]权重无效`);
        }
        return {
          id: item.id
            ? requiredText(item.id, `题目[${index}]评分点[${rubricIndex}] ID`)
            : `rubric-${rubricIndex + 1}`,
          criterion: requiredText(item.criterion, `题目[${index}]评分点[${rubricIndex}]`),
          description: normalizeOptionalText(item.description),
          weight,
          required: item.required ?? false,
        };
      });
      if (new Set(rubric.map((item) => item.id)).size !== rubric.length) {
        throw new Error(`题目 ${stableKey} 的评分点 ID 不能重复`);
      }
      const followups = (question.followups ?? []).map((followup, followupIndex) => ({
        prompt: requiredText(followup.prompt, `题目[${index}]追问[${followupIndex}]`),
        trigger: normalizeOptionalText(followup.trigger),
      }));
      const sources = question.sources?.length
        ? question.sources.map((reference) => ({
            sourceKey: requiredText(reference.sourceKey, `题目[${index}]来源引用`),
            locator: reference.locator ?? {},
          }))
        : [{ sourceKey: normalizedSources[0]!.key, locator: {} }];
      for (const reference of sources) {
        if (!sourceKeys.has(reference.sourceKey)) {
          throw new Error(`题目 ${stableKey} 引用了不存在的来源: ${reference.sourceKey}`);
        }
      }
      if (question.version !== undefined
        && (!Number.isSafeInteger(question.version) || question.version <= 0)) {
        throw new Error(`题目 ${stableKey} 的来源版本无效`);
      }
      const estimatedDurationSeconds = question.estimatedDurationSeconds;
      if (estimatedDurationSeconds !== undefined
        && (!Number.isSafeInteger(estimatedDurationSeconds) || estimatedDurationSeconds <= 0)) {
        throw new Error(`题目 ${stableKey} 的预计作答时间无效`);
      }
      const answerOutline = normalizeTextArray(question.answerOutline, `题目[${index}]答案提纲`);
      if (status === "published" && (answerOutline.length === 0 || rubric.length === 0)) {
        throw new Error(`已发布题目 ${stableKey} 必须包含答案提纲和评分点`);
      }
      const normalized = {
        stableKey,
        version: question.version ?? null,
        status,
        title: requiredText(question.title, `题目[${index}]标题`),
        prompt: requiredText(question.prompt, `题目[${index}]题干`),
        kind: question.kind,
        difficulty: question.difficulty,
        answerOutline,
        commonMistakes: normalizeTextArray(question.commonMistakes, `题目[${index}]常见错误`),
        alternativeAnswers: normalizeTextArray(question.alternativeAnswers, `题目[${index}]替代表述`),
        estimatedDurationSeconds: estimatedDurationSeconds ?? null,
        metadata: question.metadata ?? {},
        tags: [...uniqueTags.values()].sort((left, right) =>
          left.axis.localeCompare(right.axis) || left.key.localeCompare(right.key)),
        rubric,
        followups,
        sources,
      };
      const revisionSources = sources.map((reference) => {
        const source = normalizedSources.find((candidate) => candidate.key === reference.sourceKey)!;
        return {
          sourceFingerprint: source.fingerprint,
          locator: reference.locator,
        };
      }).sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
      const contentHash = hashContent(stableJson({
        status: normalized.status,
        title: normalized.title,
        prompt: normalized.prompt,
        kind: normalized.kind,
        difficulty: normalized.difficulty,
        answerOutline: normalized.answerOutline,
        commonMistakes: normalized.commonMistakes,
        alternativeAnswers: normalized.alternativeAnswers,
        estimatedDurationSeconds: normalized.estimatedDurationSeconds,
        metadata: normalized.metadata,
        tags: normalized.tags,
        rubric: normalized.rubric,
        followups: normalized.followups,
        sources: revisionSources,
      }));
      return { ...normalized, contentHash };
    });
    const payloadHash = hashContent(stableJson({
      packageId,
      packageVersion,
      sources: normalizedSources,
      questions: normalizedQuestions,
    }));
    const declaredHash = normalizeOptionalText(input.contentHash);
    const packageHash = declaredHash ? hashContent(`${declaredHash}\u0000${payloadHash}`) : payloadHash;

    const nested = this.database.isTransaction;
    this.database.exec(nested ? "SAVEPOINT question_package_import" : "BEGIN IMMEDIATE");
    try {
      const previous = this.database.prepare(`
        SELECT id, package_hash, inserted_count, updated_count, unchanged_count
        FROM question_imports
        WHERE package_id = ? AND package_version = ?
      `).get(packageId, packageVersion) as {
        id: string;
        package_hash: string;
        inserted_count: number;
        updated_count: number;
        unchanged_count: number;
      } | undefined;
      if (previous) {
        if (previous.package_hash !== packageHash) {
          throw new Error(`题包 ${packageId} 的版本 ${packageVersion} 内容冲突`);
        }
        this.database.exec(nested ? "RELEASE SAVEPOINT question_package_import" : "COMMIT");
        return {
          importId: previous.id,
          packageHash,
          inserted: previous.inserted_count,
          updated: previous.updated_count,
          unchanged: previous.unchanged_count,
          alreadyImported: true,
        };
      }

      const now = new Date().toISOString();
      const sourceIds = new Map<string, string>();
      const findSource = this.database.prepare("SELECT id FROM question_sources WHERE fingerprint = ?");
      const insertSource = this.database.prepare(`
        INSERT INTO question_sources (
          id, kind, title, uri, mime_type, parser_id, parser_version,
          metadata_json, content_hash, fingerprint, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const source of normalizedSources) {
        const existing = findSource.get(source.fingerprint) as { id: string } | undefined;
        const sourceId = existing?.id ?? randomUUID();
        if (!existing) {
          insertSource.run(
            sourceId,
            source.kind,
            source.title,
            source.uri || null,
            source.mimeType || null,
            source.parserId || null,
            source.parserVersion || null,
            stableJson(source.metadata),
            source.contentHash,
            source.fingerprint,
            now,
          );
        }
        sourceIds.set(source.key, sourceId);
      }

      const findItem = this.database.prepare(`
        SELECT q.id, q.status AS item_status,
               q.current_version_id, current.version AS current_version, current.content_hash,
               q.published_version_id, published.version AS published_version
        FROM question_bank_items q
        LEFT JOIN question_versions current ON current.id = q.current_version_id
        LEFT JOIN question_versions published ON published.id = q.published_version_id
        WHERE q.stable_key = ?
      `);
      const findRevision = this.database.prepare(`
        SELECT id, content_hash FROM question_versions WHERE question_id = ? AND version = ?
      `);
      const insertItem = this.database.prepare(`
        INSERT INTO question_bank_items (
          id, stable_key, status, current_version_id, published_version_id, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, NULL, ?, ?)
      `);
      const nextVersion = this.database.prepare(`
        SELECT COALESCE(MAX(version), 0) + 1 AS version FROM question_versions WHERE question_id = ?
      `);
      const insertVersion = this.database.prepare(`
        INSERT INTO question_versions (
          id, question_id, version, status, title, prompt, kind, difficulty,
          answer_outline_json, common_mistakes_json, alternative_answers_json,
          estimated_duration_seconds, metadata_json, search_text, content_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateItemPointers = this.database.prepare(`
        UPDATE question_bank_items
        SET status = ?, current_version_id = ?, published_version_id = ?, updated_at = ?
        WHERE id = ?
      `);
      const findTag = this.database.prepare("SELECT id FROM question_tags WHERE axis = ? AND tag_key = ?");
      const insertTag = this.database.prepare(`
        INSERT INTO question_tags (id, axis, tag_key, label, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertVersionTag = this.database.prepare(`
        INSERT INTO question_version_tags (version_id, tag_id, label) VALUES (?, ?, ?)
      `);
      const insertRubric = this.database.prepare(`
        INSERT INTO question_rubric_items (
          id, version_id, ordinal, rubric_key, criterion, description, weight, required
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertFollowup = this.database.prepare(`
        INSERT INTO question_followups (id, version_id, ordinal, prompt, trigger_text)
        VALUES (?, ?, ?, ?, ?)
      `);
      const insertVersionSource = this.database.prepare(`
        INSERT OR IGNORE INTO question_version_sources (
          id, version_id, source_id, locator_json, locator_hash
        ) VALUES (?, ?, ?, ?, ?)
      `);

      let inserted = 0;
      let updated = 0;
      let unchanged = 0;
      for (const question of normalizedQuestions) {
        const existing = findItem.get(question.stableKey) as {
          id: string;
          item_status: QuestionBankStatus;
          current_version_id: string | null;
          current_version: number | null;
          content_hash: string | null;
          published_version_id: string | null;
          published_version: number | null;
        } | undefined;
        const questionId = existing?.id ?? randomUUID();
        if (!existing) insertItem.run(questionId, question.stableKey, question.status, now, now);

        let versionId = existing?.current_version_id ?? "";
        let version: number;
        let createRevision = false;
        let promoteRevision = false;
        if (question.version !== null) {
          version = question.version;
          const revision = findRevision.get(questionId, version) as {
            id: string;
            content_hash: string;
          } | undefined;
          if (revision) {
            if (revision.content_hash !== question.contentHash) {
              throw new Error(`题目 ${question.stableKey} 的第 ${version} 版内容冲突`);
            }
            versionId = revision.id;
            unchanged += 1;
          } else {
            createRevision = true;
            promoteRevision = !existing || version > (existing.current_version ?? 0);
          }
        } else if (!existing || existing.content_hash !== question.contentHash) {
          version = Number((nextVersion.get(questionId) as { version: number }).version);
          createRevision = true;
          promoteRevision = true;
        } else {
          version = existing.current_version ?? 1;
          unchanged += 1;
        }

        if (createRevision) {
          versionId = randomUUID();
          const searchText = [
            question.title,
            question.prompt,
            ...question.answerOutline,
            ...question.commonMistakes,
            ...question.alternativeAnswers,
            question.kind,
            question.difficulty,
            ...question.tags.flatMap((tag) => [tag.key, tag.label]),
          ].join("\n");
          insertVersion.run(
            versionId,
            questionId,
            version,
            question.status,
            question.title,
            question.prompt,
            question.kind,
            question.difficulty,
            JSON.stringify(question.answerOutline),
            JSON.stringify(question.commonMistakes),
            JSON.stringify(question.alternativeAnswers),
            question.estimatedDurationSeconds,
            stableJson(question.metadata),
            searchText,
            question.contentHash,
            now,
          );
          for (const tag of question.tags) {
            const existingTag = findTag.get(tag.axis, tag.key) as { id: string } | undefined;
            const tagId = existingTag?.id ?? randomUUID();
            if (!existingTag) insertTag.run(tagId, tag.axis, tag.key, tag.label, now, now);
            insertVersionTag.run(versionId, tagId, tag.label);
          }
          question.rubric.forEach((rubric, ordinal) => {
            insertRubric.run(
              randomUUID(), versionId, ordinal, rubric.id, rubric.criterion, rubric.description,
              rubric.weight, rubric.required ? 1 : 0,
            );
          });
          question.followups.forEach((followup, ordinal) => {
            insertFollowup.run(randomUUID(), versionId, ordinal, followup.prompt, followup.trigger || null);
          });
          let itemStatus = existing?.item_status ?? question.status;
          let currentVersionId = existing?.current_version_id ?? versionId;
          let publishedVersionId = existing?.published_version_id ?? null;
          if (promoteRevision) {
            currentVersionId = versionId;
            if (question.status === "published") {
              publishedVersionId = versionId;
              itemStatus = "published";
            } else if (question.status === "deprecated") {
              itemStatus = "deprecated";
            } else if (!publishedVersionId) {
              itemStatus = question.status;
            }
          } else if (
            question.status === "published"
            && version > (existing?.published_version ?? 0)
            && existing?.item_status !== "deprecated"
          ) {
            publishedVersionId = versionId;
            itemStatus = "published";
          }
          updateItemPointers.run(itemStatus, currentVersionId, publishedVersionId, now, questionId);
          if (existing) updated += 1;
          else inserted += 1;
        }

        for (const reference of question.sources) {
          const sourceId = sourceIds.get(reference.sourceKey)!;
          const locatorJson = stableJson(reference.locator);
          insertVersionSource.run(
            randomUUID(), versionId, sourceId, locatorJson, hashContent(locatorJson),
          );
        }
      }

      const importId = randomUUID();
      this.database.prepare(`
        INSERT INTO question_imports (
          id, package_id, package_version, package_hash, source_ids_json,
          question_count, inserted_count, updated_count, unchanged_count, imported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        importId,
        packageId,
        packageVersion,
        packageHash,
        JSON.stringify([...sourceIds.values()]),
        normalizedQuestions.length,
        inserted,
        updated,
        unchanged,
        now,
      );
      this.database.exec(nested ? "RELEASE SAVEPOINT question_package_import" : "COMMIT");
      return { importId, packageHash, inserted, updated, unchanged, alreadyImported: false };
    } catch (error) {
      if (nested) {
        this.database.exec("ROLLBACK TO SAVEPOINT question_package_import");
        this.database.exec("RELEASE SAVEPOINT question_package_import");
      } else {
        this.database.exec("ROLLBACK");
      }
      throw error;
    }
  }

  getQuestionBankSnapshot(): QuestionBankSnapshot {
    const counts = this.database.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN q.status = 'published' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN q.status = 'published' AND COALESCE(us.is_favorite, 0) = 1 THEN 1 ELSE 0 END) AS favorites
      FROM question_bank_items q
      JOIN question_versions v ON v.id = q.current_version_id
      LEFT JOIN question_user_state us ON us.question_id = q.id
    `).get() as { total: number; published: number | null; favorites: number | null };
    const kindRows = this.database.prepare(`
      SELECT v.kind AS value, COUNT(*) AS count
      FROM question_bank_items q
      JOIN question_versions v ON v.id = q.published_version_id
      WHERE q.status = 'published'
      GROUP BY v.kind
    `).all() as unknown as Array<{ value: InterviewQuestionKind; count: number }>;
    const difficultyRows = this.database.prepare(`
      SELECT v.difficulty AS value, COUNT(*) AS count
      FROM question_bank_items q
      JOIN question_versions v ON v.id = q.published_version_id
      WHERE q.status = 'published'
      GROUP BY v.difficulty
    `).all() as unknown as Array<{ value: InterviewQuestionDifficulty; count: number }>;
    const facet = (axis: "role" | "skill") => this.database.prepare(`
      SELECT t.tag_key AS value, vt.label, COUNT(DISTINCT q.id) AS count
      FROM question_bank_items q
      JOIN question_versions v ON v.id = q.published_version_id
      JOIN question_version_tags vt ON vt.version_id = v.id
      JOIN question_tags t ON t.id = vt.tag_id
      WHERE q.status = 'published' AND t.axis = ?
      GROUP BY t.tag_key, vt.label
      ORDER BY count DESC, vt.label, t.tag_key
    `).all(axis) as unknown as Array<{ value: string; label: string; count: number }>;
    const byKind: Record<InterviewQuestionKind, number> = {
      technical: 0,
      project: 0,
      behavioral: 0,
      scenario: 0,
    };
    for (const row of kindRows) byKind[row.value] = Number(row.count);
    const byDifficulty: Record<InterviewQuestionDifficulty, number> = {
      introductory: 0,
      intermediate: 0,
      advanced: 0,
    };
    for (const row of difficultyRows) byDifficulty[row.value] = Number(row.count);
    return {
      total: Number(counts.total),
      published: Number(counts.published ?? 0),
      favorites: Number(counts.favorites ?? 0),
      byKind,
      byDifficulty,
      roles: facet("role").map((row) => ({ ...row, count: Number(row.count) })),
      skills: facet("skill").map((row) => ({ ...row, count: Number(row.count) })),
    };
  }

  listQuestionBank(query: QuestionBankListQuery = {}): QuestionBankListResult {
    const offset = Math.max(0, Math.trunc(query.offset ?? 0));
    const limit = Math.max(1, Math.min(200, Math.trunc(query.limit ?? 50)));
    const conditions: string[] = ["q.status = 'published'"];
    const parameters: Array<string | number> = [];

    const search = query.search?.trim();
    if (search) {
      const searchableLength = [...search.replace(/\s+/gu, "")].length;
      if (searchableLength >= 3) {
        conditions.push(`v.rowid IN (
          SELECT rowid FROM question_versions_fts WHERE question_versions_fts MATCH ?
        )`);
        parameters.push(`"${search.replace(/"/gu, '""')}"`);
      } else {
        const escaped = search.replace(/([\\%_])/gu, "\\$1");
        const pattern = `%${escaped}%`;
        conditions.push("v.search_text LIKE ? ESCAPE '\\'");
        parameters.push(pattern);
      }
    }
    if (query.kind) {
      conditions.push("v.kind = ?");
      parameters.push(query.kind);
    }
    if (query.difficulty) {
      conditions.push("v.difficulty = ?");
      parameters.push(query.difficulty);
    }
    if (query.favoritesOnly) conditions.push("COALESCE(us.is_favorite, 0) = 1");
    const tagFilter = (axis: "role" | "skill", value: string | undefined) => {
      const key = value?.trim();
      if (!key) return;
      conditions.push(`EXISTS (
        SELECT 1 FROM question_version_tags qvt
        JOIN question_tags qt ON qt.id = qvt.tag_id
        WHERE qvt.version_id = v.id AND qt.axis = ? AND qt.tag_key = ?
      )`);
      parameters.push(axis, key);
    };
    tagFilter("role", query.role);
    tagFilter("skill", query.skill);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const from = `
      FROM question_bank_items q
      JOIN question_versions v ON v.id = q.published_version_id
      LEFT JOIN question_user_state us ON us.question_id = q.id
      ${where}
    `;
    const total = Number((this.database.prepare(`SELECT COUNT(*) AS count ${from}`)
      .get(...parameters) as { count: number }).count);
    const rows = this.database.prepare(`
      SELECT q.id, q.stable_key, v.status, q.created_at, v.created_at AS updated_at,
             v.id AS version_id, v.version, v.title, v.prompt, v.kind, v.difficulty,
             v.estimated_duration_seconds, v.metadata_json,
             COALESCE(us.is_favorite, 0) AS is_favorite,
             COALESCE((
               SELECT qs.title
               FROM question_version_sources qvs
               JOIN question_sources qs ON qs.id = qvs.source_id
               WHERE qvs.version_id = v.id
               ORDER BY qvs.rowid
               LIMIT 1
             ), '') AS source_label
      ${from}
      ORDER BY v.created_at DESC, q.rowid DESC
      LIMIT ? OFFSET ?
    `).all(...parameters, limit, offset) as unknown as Array<{
      id: string;
      stable_key: string;
      status: string;
      created_at: string;
      updated_at: string;
      version_id: string;
      version: number;
      title: string;
      prompt: string;
      kind: string;
      difficulty: string;
      estimated_duration_seconds: number | null;
      metadata_json: string;
      is_favorite: number;
      source_label: string;
    }>;
    const getTags = this.database.prepare(`
      SELECT t.id, t.axis, t.tag_key, vt.label
      FROM question_version_tags vt
      JOIN question_tags t ON t.id = vt.tag_id
      WHERE vt.version_id = ?
      ORDER BY t.axis, vt.label, t.tag_key
    `);
    const items = rows.map((row): QuestionBankQuestionSummary => {
      const metadata = parseJsonObject(row.metadata_json);
      const tags = (getTags.all(row.version_id) as unknown as Array<{
        id: string;
        axis: string;
        tag_key: string;
        label: string;
      }>);
      const values = (axis: QuestionTagAxis) => tags
        .filter((tag) => tag.axis === axis)
        .map((tag) => tag.tag_key);
      return {
        id: row.id,
        stableKey: row.stable_key,
        version: row.version,
        status: row.status as QuestionBankStatus,
        title: row.title,
        prompt: row.prompt,
        kind: row.kind as InterviewQuestionKind,
        subtype: typeof metadata.subtype === "string" ? metadata.subtype : values("subtype")[0] ?? "",
        difficulty: row.difficulty as InterviewQuestionDifficulty,
        roles: values("role"),
        seniority: values("level"),
        competencies: values("competency"),
        skills: values("skill"),
        estimatedSeconds: row.estimated_duration_seconds ?? 0,
        favorite: row.is_favorite === 1,
        sourceLabel: row.source_label,
        updatedAt: row.updated_at,
      };
    });
    return { items, total, offset, limit, hasMore: offset + items.length < total };
  }

  getQuestionBankItem(idOrStableKey: string): QuestionBankQuestionDetail | null {
    const row = this.database.prepare(`
      SELECT q.id, q.stable_key, v.status, q.created_at, v.created_at AS updated_at,
             v.id AS version_id, v.version, v.title, v.prompt, v.kind, v.difficulty,
             v.answer_outline_json, v.common_mistakes_json, v.alternative_answers_json,
             v.estimated_duration_seconds, v.metadata_json,
             COALESCE(us.is_favorite, 0) AS is_favorite
      FROM question_bank_items q
      JOIN question_versions v ON v.id = CASE
        WHEN q.status = 'published' THEN q.published_version_id
        ELSE q.current_version_id
      END
      LEFT JOIN question_user_state us ON us.question_id = q.id
      WHERE q.id = ? OR q.stable_key = ?
      LIMIT 1
    `).get(idOrStableKey, idOrStableKey) as {
      id: string;
      stable_key: string;
      status: string;
      created_at: string;
      updated_at: string;
      version_id: string;
      version: number;
      title: string;
      prompt: string;
      kind: string;
      difficulty: string;
      answer_outline_json: string;
      common_mistakes_json: string;
      alternative_answers_json: string;
      estimated_duration_seconds: number | null;
      metadata_json: string;
      is_favorite: number;
    } | undefined;
    if (!row) return null;

    const tags = this.database.prepare(`
      SELECT t.id, t.axis, t.tag_key, vt.label
      FROM question_version_tags vt
      JOIN question_tags t ON t.id = vt.tag_id
      WHERE vt.version_id = ?
      ORDER BY t.axis, vt.label, t.tag_key
    `).all(row.version_id) as unknown as Array<{ id: string; axis: string; tag_key: string; label: string }>;
    const rubric = this.database.prepare(`
      SELECT id, ordinal, rubric_key, criterion, description, weight, required
      FROM question_rubric_items WHERE version_id = ? ORDER BY ordinal
    `).all(row.version_id) as unknown as Array<{
      id: string; ordinal: number; rubric_key: string; criterion: string; description: string; weight: number; required: number;
    }>;
    const followups = this.database.prepare(`
      SELECT id, ordinal, prompt, trigger_text
      FROM question_followups WHERE version_id = ? ORDER BY ordinal
    `).all(row.version_id) as unknown as Array<{
      id: string; ordinal: number; prompt: string; trigger_text: string | null;
    }>;
    const sources = this.database.prepare(`
      SELECT s.id, s.kind, s.title, s.uri, s.mime_type, s.parser_id, s.parser_version,
             s.metadata_json, s.content_hash, vs.locator_json
      FROM question_version_sources vs
      JOIN question_sources s ON s.id = vs.source_id
      WHERE vs.version_id = ?
      ORDER BY s.kind, s.title, vs.rowid
    `).all(row.version_id) as unknown as Array<{
      id: string;
      kind: string;
      title: string;
      uri: string | null;
      mime_type: string | null;
      parser_id: string | null;
      parser_version: string | null;
      metadata_json: string;
      content_hash: string;
      locator_json: string;
    }>;
    const metadata = parseJsonObject(row.metadata_json);
    const mappedTags = tags.map((tag) => ({
      axis: tag.axis as QuestionTagAxis,
      key: tag.tag_key,
      label: tag.label,
    }));
    const tagValues = (axis: QuestionTagAxis) => mappedTags
      .filter((tag) => tag.axis === axis)
      .map((tag) => tag.key);
    const primarySource = sources[0];
    if (!primarySource) throw new Error(`题目 ${row.stable_key} 缺少来源记录`);
    const sourceMetadata = parseJsonObject(primarySource.metadata_json);
    const source: QuestionBankApiSource = {
      id: primarySource.id,
      type: primarySource.kind as QuestionSourceKind,
      title: primarySource.title,
      ...(primarySource.uri ? { uri: primarySource.uri } : {}),
      ...(primarySource.mime_type ? { mimeType: primarySource.mime_type } : {}),
      ...(typeof sourceMetadata.license === "string" ? { license: sourceMetadata.license } : {}),
      ...(typeof sourceMetadata.attribution === "string" ? { attribution: sourceMetadata.attribution } : {}),
      ...(primarySource.parser_id ? { parserId: primarySource.parser_id } : {}),
      ...(primarySource.parser_version ? { parserVersion: primarySource.parser_version } : {}),
      contentHash: primarySource.content_hash,
      ...(primarySource.locator_json === "{}"
        ? {}
        : { locator: parseJsonObject(primarySource.locator_json) }),
      metadata: sourceMetadata,
    };
    return {
      id: row.id,
      stableKey: row.stable_key,
      version: row.version,
      status: row.status as QuestionBankStatus,
      title: row.title,
      prompt: row.prompt,
      kind: row.kind as InterviewQuestionKind,
      subtype: typeof metadata.subtype === "string" ? metadata.subtype : tagValues("subtype")[0] ?? "",
      difficulty: row.difficulty as InterviewQuestionDifficulty,
      roles: tagValues("role"),
      seniority: tagValues("level"),
      competencies: tagValues("competency"),
      skills: tagValues("skill"),
      estimatedSeconds: row.estimated_duration_seconds ?? 0,
      favorite: row.is_favorite === 1,
      sourceLabel: primarySource.title,
      updatedAt: row.updated_at,
      intent: typeof metadata.intent === "string" ? metadata.intent : "",
      answerOutline: parseStringArray(row.answer_outline_json),
      commonMistakes: parseStringArray(row.common_mistakes_json),
      rubric: rubric.map((item) => ({
        id: item.rubric_key,
        label: item.criterion,
        description: item.description,
        weight: item.weight,
        critical: item.required === 1,
      })),
      followUps: followups.map((followup) => ({
        prompt: followup.prompt,
        trigger: followup.trigger_text ?? "",
      })),
      source,
    };
  }

  setQuestionFavorite(questionId: string, favorite: boolean): QuestionBankFavoriteResult {
    const exists = this.database.prepare("SELECT 1 AS found FROM question_bank_items WHERE id = ?")
      .get(questionId) as { found: number } | undefined;
    if (!exists) throw new Error("题目不存在");
    const now = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO question_user_state (question_id, is_favorite, favorite_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(question_id) DO UPDATE SET
        is_favorite = excluded.is_favorite,
        favorite_at = excluded.favorite_at,
        updated_at = excluded.updated_at
    `).run(questionId, favorite ? 1 : 0, favorite ? now : null, now);
    const count = this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM question_user_state us
      JOIN question_bank_items q ON q.id = us.question_id
      WHERE us.is_favorite = 1 AND q.status = 'published'
    `).get() as { count: number };
    return { questionId, favorite, favorites: Number(count.count) };
  }

  getQuestionPracticeOverview(): QuestionPracticeOverview {
    const active = this.database.prepare(`
      SELECT id, current_ordinal, question_count, updated_at
      FROM question_practice_sessions
      WHERE status = 'active'
      ORDER BY updated_at DESC
      LIMIT 1
    `).get() as {
      id: string;
      current_ordinal: number;
      question_count: number;
      updated_at: string;
    } | undefined;
    const counts = this.database.prepare(`
      SELECT
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions
      FROM question_practice_sessions
    `).get() as { completed_sessions: number | null };
    const practiced = this.database.prepare(`
      SELECT COUNT(DISTINCT i.stable_key) AS count
      FROM question_practice_attempts a
      JOIN question_practice_items i ON i.id = a.item_id
    `).get() as { count: number };
    const due = this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM question_practice_progress
      WHERE next_review_at IS NOT NULL AND next_review_at <= ?
    `).get(new Date().toISOString()) as { count: number };
    return {
      ...(active ? {
        activeSession: {
          id: active.id,
          currentOrdinal: active.current_ordinal,
          questionCount: active.question_count,
          updatedAt: active.updated_at,
        },
      } : {}),
      completedSessions: Number(counts.completed_sessions ?? 0),
      practicedQuestions: Number(practiced.count),
      dueReview: Number(due.count),
    };
  }

  startQuestionPractice(request: QuestionPracticeStartRequest): QuestionPracticeSession {
    const operationId = requiredText(request.operationId, "练习创建操作 ID");
    const selectionJson = stableJson(request.selection);
    this.database.exec("BEGIN IMMEDIATE");
    let sessionId = "";
    try {
      const replay = this.database.prepare(`
        SELECT id, selection_json
        FROM question_practice_sessions
        WHERE create_operation_id = ?
      `).get(operationId) as { id: string; selection_json: string } | undefined;
      if (replay) {
        if (replay.selection_json !== selectionJson) throw new Error("练习创建操作 ID 已用于其他参数");
        sessionId = replay.id;
        this.database.exec("COMMIT");
        return this.requireQuestionPracticeSession(sessionId);
      }

      const active = this.database.prepare(`
        SELECT id FROM question_practice_sessions WHERE status = 'active' LIMIT 1
      `).get() as { id: string } | undefined;
      if (active) throw new Error("已有进行中的题库练习，请先继续或结束当前练习");

      let questions: QuestionPracticeSnapshotRecord[];
      if (request.selection.kind === "single") {
        const snapshot = this.getPublishedQuestionPracticeSnapshot(request.selection.questionId);
        if (!snapshot) throw new Error("题目不存在、未发布或已停用");
        if (request.selection.expectedVersion !== undefined
          && snapshot.version !== request.selection.expectedVersion) {
          throw new Error("题目版本已经更新，请刷新题库后重试");
        }
        questions = [snapshot];
      } else if (request.selection.kind === "filtered") {
        const { count, order, query } = request.selection;
        if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
          throw new Error("练习题数必须在 1 到 100 之间");
        }
        if (order !== "latest" && order !== "random") throw new Error("练习题目顺序无效");
        const summaries: QuestionBankQuestionSummary[] = [];
        let offset = 0;
        do {
          const page = this.listQuestionBank({ ...query, limit: 200, offset });
          summaries.push(...page.items);
          if (!page.hasMore) break;
          offset += page.items.length;
        } while (summaries.length < 100_000);
        if (order === "random") {
          for (let index = summaries.length - 1; index > 0; index -= 1) {
            const target = Math.floor(Math.random() * (index + 1));
            [summaries[index], summaries[target]] = [summaries[target]!, summaries[index]!];
          }
        }
        questions = summaries.slice(0, count).map((summary) => {
          const snapshot = this.getPublishedQuestionPracticeSnapshot(summary.id);
          if (!snapshot) throw new Error(`练习题 ${summary.stableKey} 已不再可用`);
          return snapshot;
        });
        if (questions.length === 0) throw new Error("当前筛选条件下没有可练习的题目");
      } else {
        throw new Error("练习题目选择方式无效");
      }

      const now = new Date().toISOString();
      sessionId = randomUUID();
      this.database.prepare(`
        INSERT INTO question_practice_sessions (
          id, create_operation_id, selection_kind, selection_json, status,
          question_count, current_ordinal, state_version, started_at, updated_at
        ) VALUES (?, ?, ?, ?, 'active', ?, 0, 0, ?, ?)
      `).run(
        sessionId,
        operationId,
        request.selection.kind,
        selectionJson,
        questions.length,
        now,
        now,
      );
      const insertItem = this.database.prepare(`
        INSERT INTO question_practice_items (
          id, session_id, ordinal, question_id, question_version_id, stable_key,
          version, title, difficulty, status, snapshot_json, snapshot_hash, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      questions.forEach((question, ordinal) => {
        const snapshotJson = stableJson(question);
        insertItem.run(
          randomUUID(),
          sessionId,
          ordinal,
          question.questionId,
          question.questionVersionId,
          question.stableKey,
          question.version,
          question.title,
          question.difficulty,
          ordinal === 0 ? "answering" : "pending",
          snapshotJson,
          hashContent(snapshotJson),
          ordinal === 0 ? now : null,
        );
      });
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
    return this.requireQuestionPracticeSession(sessionId);
  }

  getQuestionPracticeSession(sessionId: string): QuestionPracticeSession | null {
    const row = this.database.prepare(`
      SELECT * FROM question_practice_sessions WHERE id = ?
    `).get(sessionId) as QuestionPracticeSessionRow | undefined;
    if (!row) return null;
    const items = this.database.prepare(`
      SELECT *
      FROM question_practice_items
      WHERE session_id = ?
      ORDER BY ordinal
    `).all(sessionId) as unknown as QuestionPracticeItemRow[];
    const attempts = this.database.prepare(`
      SELECT *
      FROM question_practice_attempts
      WHERE session_id = ?
      ORDER BY submitted_at, id
    `).all(sessionId) as unknown as QuestionPracticeAttemptRow[];
    const attemptByItem = new Map(attempts.map((attempt) => [attempt.item_id, attempt]));
    const queue: QuestionPracticeQueueItem[] = items.map((item) => ({
      id: item.id,
      ordinal: item.ordinal,
      stableKey: item.stable_key,
      version: item.version,
      title: item.title,
      difficulty: item.difficulty as InterviewQuestionDifficulty,
      status: item.status as QuestionPracticeItemStatus,
    }));
    let currentItem: QuestionPracticeCurrentItem | null = null;
    if (row.status === "active") {
      const item = items.find((candidate) => candidate.ordinal === row.current_ordinal);
      if (!item) throw new Error("练习队列损坏，找不到当前题目");
      const snapshot = parseQuestionPracticeSnapshot(item.snapshot_json);
      if (hashContent(stableJson(snapshot)) !== item.snapshot_hash) {
        throw new Error("练习题快照校验失败，无法恢复该练习");
      }
      const attempt = attemptByItem.get(item.id);
      const revealReview = item.status === "reviewing";
      currentItem = {
        id: item.id,
        ordinal: item.ordinal,
        stableKey: item.stable_key,
        version: item.version,
        title: item.title,
        difficulty: item.difficulty as InterviewQuestionDifficulty,
        status: item.status as QuestionPracticeItemStatus,
        questionId: snapshot.questionId,
        prompt: snapshot.prompt,
        kind: snapshot.kind,
        roles: [...snapshot.roles],
        seniority: [...snapshot.seniority],
        competencies: [...snapshot.competencies],
        skills: [...snapshot.skills],
        estimatedSeconds: snapshot.estimatedSeconds,
        draftAnswer: item.draft_answer,
        draftRevision: item.draft_revision,
        elapsedSeconds: attempt?.elapsed_seconds ?? item.draft_elapsed_seconds,
        coveredRubricIds: attempt ? parseStringArray(attempt.covered_rubric_ids_json) : [],
        ...(item.started_at ? { startedAt: item.started_at } : {}),
        ...(revealReview && attempt ? {
          answerText: attempt.answer_text,
          ...(attempt.self_rating ? { selfRating: attempt.self_rating as QuestionPracticeSelfRating } : {}),
          ...(attempt.self_note ? { selfNote: attempt.self_note } : {}),
          review: structuredClone(snapshot.review),
          submittedAt: attempt.submitted_at,
          ...(attempt.reviewed_at ? { reviewedAt: attempt.reviewed_at } : {}),
        } : {}),
      };
    }
    return {
      id: row.id,
      status: row.status as QuestionPracticeSessionStatus,
      selectionKind: row.selection_kind as QuestionPracticeSelection["kind"],
      questionCount: row.question_count,
      currentOrdinal: row.current_ordinal,
      stateVersion: row.state_version,
      queue,
      currentItem,
      summary: this.buildQuestionPracticeSummary(items, attempts),
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      ...(row.completed_at ? { completedAt: row.completed_at } : {}),
      ...(row.abandoned_at ? { abandonedAt: row.abandoned_at } : {}),
    };
  }

  saveQuestionPracticeDraft(request: QuestionPracticeSaveDraftRequest): QuestionPracticeSaveDraftResult {
    if (!Number.isSafeInteger(request.draftRevision) || request.draftRevision < 0) {
      throw new Error("练习草稿版本无效");
    }
    const elapsedSeconds = request.elapsedSeconds === undefined
      ? undefined
      : Number(request.elapsedSeconds);
    if (elapsedSeconds !== undefined
      && (!Number.isSafeInteger(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > 604_800)) {
      throw new Error("练习用时无效");
    }
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database.prepare(`
        SELECT i.*, s.status AS session_status, s.current_ordinal
        FROM question_practice_items i
        JOIN question_practice_sessions s ON s.id = i.session_id
        WHERE i.id = ? AND i.session_id = ?
      `).get(request.itemId, request.sessionId) as (QuestionPracticeItemRow & {
        session_status: string;
        current_ordinal: number;
      }) | undefined;
      if (!row) throw new Error("练习题目不存在");
      if (row.session_status !== "active" || row.ordinal !== row.current_ordinal || row.status !== "answering") {
        throw new Error("当前练习题不能保存草稿");
      }
      if (request.draftRevision <= row.draft_revision) {
        if (elapsedSeconds !== undefined && elapsedSeconds > row.draft_elapsed_seconds) {
          const now = new Date().toISOString();
          this.database.prepare(`
            UPDATE question_practice_items
            SET draft_elapsed_seconds = ?, draft_saved_at = ?
            WHERE id = ?
          `).run(elapsedSeconds, now, request.itemId);
          this.database.prepare(`
            UPDATE question_practice_sessions SET updated_at = ? WHERE id = ?
          `).run(now, request.sessionId);
          this.database.exec("COMMIT");
          return {
            sessionId: request.sessionId,
            itemId: request.itemId,
            draftRevision: row.draft_revision,
            savedAt: now,
          };
        }
        const savedAt = row.draft_saved_at ?? row.started_at ?? new Date().toISOString();
        this.database.exec("COMMIT");
        return {
          sessionId: request.sessionId,
          itemId: request.itemId,
          draftRevision: row.draft_revision,
          savedAt,
        };
      }
      const now = new Date().toISOString();
      this.database.prepare(`
        UPDATE question_practice_items
        SET draft_answer = ?, draft_revision = ?, draft_elapsed_seconds = ?, draft_saved_at = ?
        WHERE id = ?
      `).run(
        request.answer,
        request.draftRevision,
        Math.max(row.draft_elapsed_seconds, elapsedSeconds ?? 0),
        now,
        request.itemId,
      );
      this.database.prepare(`
        UPDATE question_practice_sessions SET updated_at = ? WHERE id = ?
      `).run(now, request.sessionId);
      this.database.exec("COMMIT");
      return {
        sessionId: request.sessionId,
        itemId: request.itemId,
        draftRevision: request.draftRevision,
        savedAt: now,
      };
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }

  submitQuestionPracticeAnswer(request: QuestionPracticeSubmitAnswerRequest): QuestionPracticeSession {
    if (!Number.isSafeInteger(request.expectedStateVersion) || request.expectedStateVersion < 0) {
      throw new Error("练习状态版本无效");
    }
    if (!Number.isSafeInteger(request.draftRevision) || request.draftRevision < 0) {
      throw new Error("练习草稿版本无效");
    }
    if (!request.answer.trim()) throw new Error("练习回答不能为空");
    const elapsedSeconds = request.elapsedSeconds === undefined
      ? undefined
      : Number(request.elapsedSeconds);
    if (elapsedSeconds !== undefined
      && (!Number.isSafeInteger(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > 604_800)) {
      throw new Error("练习用时无效");
    }
    const answerHash = hashContent(request.answer);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const replay = this.database.prepare(`
        SELECT a.session_id, a.item_id, a.answer_hash
        FROM question_practice_attempts a
        WHERE a.submit_operation_id = ?
      `).get(request.operationId) as {
        session_id: string;
        item_id: string;
        answer_hash: string;
      } | undefined;
      if (replay) {
        if (replay.session_id !== request.sessionId || replay.item_id !== request.itemId
          || replay.answer_hash !== answerHash) {
          throw new Error("提交回答操作 ID 已用于其他参数");
        }
        this.database.exec("COMMIT");
        return this.requireQuestionPracticeSession(request.sessionId);
      }

      const session = this.requireQuestionPracticeSessionRow(request.sessionId);
      const item = this.requireQuestionPracticeItemRow(request.sessionId, request.itemId);
      if (session.status !== "active" || item.ordinal !== session.current_ordinal || item.status !== "answering") {
        throw new Error("当前练习题不能提交回答");
      }
      if (session.state_version !== request.expectedStateVersion) throw new Error("练习状态已变化，请刷新后重试");
      if (request.draftRevision < item.draft_revision) throw new Error("练习草稿已更新，请使用最新内容提交");
      if (request.draftRevision === item.draft_revision
        && item.draft_saved_at !== null
        && request.answer !== item.draft_answer) {
        throw new Error("练习草稿版本与内容不一致");
      }
      const now = new Date().toISOString();
      const inferredElapsed = item.started_at
        ? Math.max(0, Math.min(604_800, Math.floor((Date.parse(now) - Date.parse(item.started_at)) / 1000)))
        : 0;
      this.database.prepare(`
        INSERT INTO question_practice_attempts (
          id, session_id, item_id, submit_operation_id, answer_text, answer_hash,
          elapsed_seconds, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        request.sessionId,
        request.itemId,
        requiredText(request.operationId, "提交回答操作 ID"),
        request.answer,
        answerHash,
        Math.max(item.draft_elapsed_seconds, elapsedSeconds ?? inferredElapsed),
        now,
      );
      this.database.prepare(`
        UPDATE question_practice_items
        SET status = 'reviewing', draft_answer = ?, draft_revision = ?,
            draft_saved_at = ?, submitted_at = ?
        WHERE id = ?
      `).run(request.answer, request.draftRevision, now, now, request.itemId);
      this.database.prepare(`
        UPDATE question_practice_sessions
        SET state_version = state_version + 1, updated_at = ?
        WHERE id = ?
      `).run(now, request.sessionId);
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
    return this.requireQuestionPracticeSession(request.sessionId);
  }

  completeQuestionPracticeReview(request: QuestionPracticeCompleteReviewRequest): QuestionPracticeSession {
    if (!QUESTION_PRACTICE_SELF_RATINGS.includes(request.selfRating)) throw new Error("练习自评结果无效");
    if (!Number.isSafeInteger(request.expectedStateVersion) || request.expectedStateVersion < 0) {
      throw new Error("练习状态版本无效");
    }
    if (!Array.isArray(request.coveredRubricIds)
      || request.coveredRubricIds.some((id) => typeof id !== "string" || !id.trim())) {
      throw new Error("练习评分点选择无效");
    }
    const coveredRubricIds = [...new Set(request.coveredRubricIds)].sort();
    if (coveredRubricIds.length !== request.coveredRubricIds.length) throw new Error("练习评分点不能重复");
    const note = request.note ?? "";
    const coveredJson = JSON.stringify(coveredRubricIds);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const replay = this.database.prepare(`
        SELECT a.session_id, a.item_id, a.self_rating, a.covered_rubric_ids_json, a.self_note
        FROM question_practice_attempts a
        WHERE a.review_operation_id = ?
      `).get(request.operationId) as {
        session_id: string;
        item_id: string;
        self_rating: string;
        covered_rubric_ids_json: string;
        self_note: string;
      } | undefined;
      if (replay) {
        if (replay.session_id !== request.sessionId || replay.item_id !== request.itemId
          || replay.self_rating !== request.selfRating
          || stableJson(parseStringArray(replay.covered_rubric_ids_json).sort()) !== stableJson(coveredRubricIds)
          || replay.self_note !== note) {
          throw new Error("完成自评操作 ID 已用于其他参数");
        }
        this.database.exec("COMMIT");
        return this.requireQuestionPracticeSession(request.sessionId);
      }

      const session = this.requireQuestionPracticeSessionRow(request.sessionId);
      const item = this.requireQuestionPracticeItemRow(request.sessionId, request.itemId);
      if (session.status !== "active" || item.ordinal !== session.current_ordinal || item.status !== "reviewing") {
        throw new Error("当前练习题不能完成自评");
      }
      if (session.state_version !== request.expectedStateVersion) throw new Error("练习状态已变化，请刷新后重试");
      const snapshot = parseQuestionPracticeSnapshot(item.snapshot_json);
      const rubricIds = new Set(snapshot.review.rubric.map((rubric) => rubric.id));
      if (coveredRubricIds.some((id) => !rubricIds.has(id))) throw new Error("练习评分点不存在于当前题目快照");
      const attempt = this.database.prepare(`
        SELECT * FROM question_practice_attempts WHERE item_id = ?
      `).get(item.id) as QuestionPracticeAttemptRow | undefined;
      if (!attempt) throw new Error("练习回答不存在");
      if (attempt.self_rating !== null) throw new Error("当前练习题已经完成自评");
      const now = new Date().toISOString();
      this.database.prepare(`
        UPDATE question_practice_attempts
        SET self_rating = ?, covered_rubric_ids_json = ?, self_note = ?,
            review_operation_id = ?, reviewed_at = ?
        WHERE id = ?
      `).run(
        request.selfRating,
        coveredJson,
        note,
        requiredText(request.operationId, "完成自评操作 ID"),
        now,
        attempt.id,
      );
      this.database.prepare(`
        UPDATE question_practice_items
        SET status = 'completed', completed_at = ?
        WHERE id = ?
      `).run(now, item.id);

      const previous = this.database.prepare(`
        SELECT practice_count, best_rating
        FROM question_practice_progress
        WHERE stable_key = ?
      `).get(item.stable_key) as { practice_count: number; best_rating: string } | undefined;
      const previousBest = previous?.best_rating as QuestionPracticeSelfRating | undefined;
      const bestRating = previousBest
        && questionPracticeRatingRank(previousBest) > questionPracticeRatingRank(request.selfRating)
        ? previousBest
        : request.selfRating;
      const reviewState = questionPracticeReviewState(request.selfRating, now);
      this.database.prepare(`
        INSERT INTO question_practice_progress (
          stable_key, latest_question_id, latest_version, practice_count,
          last_rating, best_rating, review_status, last_practiced_at, next_review_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(stable_key) DO UPDATE SET
          latest_question_id = excluded.latest_question_id,
          latest_version = excluded.latest_version,
          practice_count = excluded.practice_count,
          last_rating = excluded.last_rating,
          best_rating = excluded.best_rating,
          review_status = excluded.review_status,
          last_practiced_at = excluded.last_practiced_at,
          next_review_at = excluded.next_review_at,
          updated_at = excluded.updated_at
      `).run(
        item.stable_key,
        item.question_id,
        item.version,
        (previous?.practice_count ?? 0) + 1,
        request.selfRating,
        bestRating,
        reviewState.reviewStatus,
        now,
        reviewState.nextReviewAt,
        now,
      );
      this.advanceQuestionPracticeSession(session, item, now);
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
    return this.requireQuestionPracticeSession(request.sessionId);
  }

  skipQuestionPracticeItem(request: QuestionPracticeSkipRequest): QuestionPracticeSession {
    if (!Number.isSafeInteger(request.expectedStateVersion) || request.expectedStateVersion < 0) {
      throw new Error("练习状态版本无效");
    }
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const replay = this.database.prepare(`
        SELECT session_id, id
        FROM question_practice_items
        WHERE skip_operation_id = ?
      `).get(request.operationId) as { session_id: string; id: string } | undefined;
      if (replay) {
        if (replay.session_id !== request.sessionId || replay.id !== request.itemId) {
          throw new Error("跳过题目操作 ID 已用于其他参数");
        }
        this.database.exec("COMMIT");
        return this.requireQuestionPracticeSession(request.sessionId);
      }
      const session = this.requireQuestionPracticeSessionRow(request.sessionId);
      const item = this.requireQuestionPracticeItemRow(request.sessionId, request.itemId);
      if (session.status !== "active" || item.ordinal !== session.current_ordinal || item.status !== "answering") {
        throw new Error("当前练习题不能跳过");
      }
      if (session.state_version !== request.expectedStateVersion) throw new Error("练习状态已变化，请刷新后重试");
      const now = new Date().toISOString();
      this.database.prepare(`
        UPDATE question_practice_items
        SET status = 'skipped', skip_operation_id = ?, completed_at = ?
        WHERE id = ?
      `).run(requiredText(request.operationId, "跳过题目操作 ID"), now, item.id);
      this.advanceQuestionPracticeSession(session, item, now);
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
    return this.requireQuestionPracticeSession(request.sessionId);
  }

  abandonQuestionPracticeSession(request: QuestionPracticeAbandonRequest): QuestionPracticeSession {
    if (!Number.isSafeInteger(request.expectedStateVersion) || request.expectedStateVersion < 0) {
      throw new Error("练习状态版本无效");
    }
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const replay = this.database.prepare(`
        SELECT id FROM question_practice_sessions WHERE abandon_operation_id = ?
      `).get(request.operationId) as { id: string } | undefined;
      if (replay) {
        if (replay.id !== request.sessionId) throw new Error("放弃练习操作 ID 已用于其他参数");
        this.database.exec("COMMIT");
        return this.requireQuestionPracticeSession(request.sessionId);
      }
      const session = this.requireQuestionPracticeSessionRow(request.sessionId);
      if (session.status !== "active") throw new Error("该练习已经结束");
      if (session.state_version !== request.expectedStateVersion) throw new Error("练习状态已变化，请刷新后重试");
      const now = new Date().toISOString();
      this.database.prepare(`
        UPDATE question_practice_sessions
        SET status = 'abandoned', abandon_operation_id = ?,
            state_version = state_version + 1, updated_at = ?, abandoned_at = ?
        WHERE id = ?
      `).run(requiredText(request.operationId, "放弃练习操作 ID"), now, now, request.sessionId);
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
    return this.requireQuestionPracticeSession(request.sessionId);
  }

  listQuestionPracticeHistory(query: QuestionPracticeHistoryQuery = {}): QuestionPracticeHistoryResult {
    const offset = Math.max(0, Math.trunc(query.offset ?? 0));
    const limit = Math.max(1, Math.min(100, Math.trunc(query.limit ?? 30)));
    const total = Number((this.database.prepare(`
      SELECT COUNT(*) AS count FROM question_practice_sessions
    `).get() as { count: number }).count);
    const rows = this.database.prepare(`
      SELECT s.*,
             SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END) AS answered,
             SUM(CASE WHEN a.self_rating IS NOT NULL THEN 1 ELSE 0 END) AS reviewed,
             SUM(CASE WHEN i.status = 'skipped' THEN 1 ELSE 0 END) AS skipped
      FROM question_practice_sessions s
      LEFT JOIN question_practice_items i ON i.session_id = s.id
      LEFT JOIN question_practice_attempts a ON a.item_id = i.id
      GROUP BY s.id
      ORDER BY s.updated_at DESC, s.id DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as unknown as Array<QuestionPracticeSessionRow & {
      answered: number;
      reviewed: number;
      skipped: number;
    }>;
    const items = rows.map((row) => ({
      id: row.id,
      status: row.status as QuestionPracticeSessionStatus,
      selectionKind: row.selection_kind as QuestionPracticeSelection["kind"],
      questionCount: row.question_count,
      currentOrdinal: row.current_ordinal,
      answered: Number(row.answered ?? 0),
      reviewed: Number(row.reviewed ?? 0),
      skipped: Number(row.skipped ?? 0),
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      ...(row.completed_at ? { completedAt: row.completed_at } : {}),
      ...(row.abandoned_at ? { abandonedAt: row.abandoned_at } : {}),
    }));
    return { items, total, offset, limit, hasMore: offset + items.length < total };
  }

  getSchemaVersion(): number {
    const row = this.database.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number | null };
    return row.version ?? 0;
  }

  private requireQuestionPracticeSession(sessionId: string): QuestionPracticeSession {
    const session = this.getQuestionPracticeSession(sessionId);
    if (!session) throw new Error("练习不存在");
    return session;
  }

  private requireQuestionPracticeSessionRow(sessionId: string): QuestionPracticeSessionRow {
    const row = this.database.prepare(`
      SELECT * FROM question_practice_sessions WHERE id = ?
    `).get(sessionId) as QuestionPracticeSessionRow | undefined;
    if (!row) throw new Error("练习不存在");
    return row;
  }

  private requireQuestionPracticeItemRow(sessionId: string, itemId: string): QuestionPracticeItemRow {
    const row = this.database.prepare(`
      SELECT *
      FROM question_practice_items
      WHERE id = ? AND session_id = ?
    `).get(itemId, sessionId) as QuestionPracticeItemRow | undefined;
    if (!row) throw new Error("练习题目不存在");
    return row;
  }

  private getPublishedQuestionPracticeSnapshot(questionId: string): QuestionPracticeSnapshotRecord | null {
    const version = this.database.prepare(`
      SELECT v.id AS version_id, v.version
      FROM question_bank_items q
      JOIN question_versions v ON v.id = q.published_version_id
      WHERE q.id = ? AND q.status = 'published' AND v.status = 'published'
      LIMIT 1
    `).get(questionId) as { version_id: string; version: number } | undefined;
    if (!version) return null;
    const detail = this.getQuestionBankItem(questionId);
    if (!detail || detail.status !== "published" || detail.version !== version.version) return null;
    return {
      questionId: detail.id,
      questionVersionId: version.version_id,
      stableKey: detail.stableKey,
      version: detail.version,
      title: detail.title,
      prompt: detail.prompt,
      kind: detail.kind,
      difficulty: detail.difficulty,
      roles: [...detail.roles],
      seniority: [...detail.seniority],
      competencies: [...detail.competencies],
      skills: [...detail.skills],
      estimatedSeconds: detail.estimatedSeconds,
      review: {
        intent: detail.intent,
        answerOutline: [...detail.answerOutline],
        rubric: structuredClone(detail.rubric),
        commonMistakes: [...detail.commonMistakes],
        followUps: structuredClone(detail.followUps),
        source: structuredClone(detail.source),
      },
    };
  }

  private buildQuestionPracticeSummary(
    items: QuestionPracticeItemRow[],
    attempts: QuestionPracticeAttemptRow[],
  ): QuestionPracticeSummary {
    const ratingCounts: Record<QuestionPracticeSelfRating, number> = {
      needs_review: 0,
      developing: 0,
      mastered: 0,
    };
    const itemById = new Map(items.map((item) => [item.id, item]));
    const weakSkills = new Map<string, number>();
    const weakCompetencies = new Map<string, number>();
    for (const attempt of attempts) {
      if (attempt.self_rating && QUESTION_PRACTICE_SELF_RATINGS.includes(attempt.self_rating as QuestionPracticeSelfRating)) {
        ratingCounts[attempt.self_rating as QuestionPracticeSelfRating] += 1;
      }
      if (attempt.self_rating !== "needs_review") continue;
      const item = itemById.get(attempt.item_id);
      if (!item) continue;
      const snapshot = parseQuestionPracticeSnapshot(item.snapshot_json);
      for (const skill of new Set(snapshot.skills)) weakSkills.set(skill, (weakSkills.get(skill) ?? 0) + 1);
      for (const competency of new Set(snapshot.competencies)) {
        weakCompetencies.set(competency, (weakCompetencies.get(competency) ?? 0) + 1);
      }
    }
    const rankCounts = (counts: Map<string, number>) => [...counts]
      .map(([value, count]) => ({ value, count }))
      .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
    return {
      answered: attempts.length,
      reviewed: attempts.filter((attempt) => attempt.self_rating !== null).length,
      skipped: items.filter((item) => item.status === "skipped").length,
      totalElapsedSeconds: attempts.reduce((total, attempt) => total + attempt.elapsed_seconds, 0),
      ratingCounts,
      weakSkills: rankCounts(weakSkills),
      weakCompetencies: rankCounts(weakCompetencies),
    };
  }

  private advanceQuestionPracticeSession(
    session: QuestionPracticeSessionRow,
    item: QuestionPracticeItemRow,
    now: string,
  ): void {
    const next = this.database.prepare(`
      SELECT id, ordinal
      FROM question_practice_items
      WHERE session_id = ? AND ordinal > ? AND status = 'pending'
      ORDER BY ordinal
      LIMIT 1
    `).get(session.id, item.ordinal) as { id: string; ordinal: number } | undefined;
    if (next) {
      this.database.prepare(`
        UPDATE question_practice_items
        SET status = 'answering', started_at = COALESCE(started_at, ?)
        WHERE id = ?
      `).run(now, next.id);
      this.database.prepare(`
        UPDATE question_practice_sessions
        SET current_ordinal = ?, state_version = state_version + 1, updated_at = ?
        WHERE id = ?
      `).run(next.ordinal, now, session.id);
      return;
    }
    this.database.prepare(`
      UPDATE question_practice_sessions
      SET status = 'completed', current_ordinal = question_count,
          state_version = state_version + 1, updated_at = ?, completed_at = ?
      WHERE id = ?
    `).run(now, now, session.id);
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);

    const currentVersion = this.getSchemaVersion();
    if (currentVersion > SCHEMA_VERSION) {
      throw new Error(`面试数据库版本 ${currentVersion} 高于客户端支持的版本 ${SCHEMA_VERSION}`);
    }
    if (currentVersion < 1) {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database.exec(`
        CREATE TABLE interviews (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          candidate_name TEXT NOT NULL,
          position_title TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('draft', 'preparing', 'ready', 'interviewing', 'generating_report', 'completed')),
          current_question_index INTEGER NOT NULL DEFAULT 0 CHECK (current_question_index >= 0),
          question_count INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 30),
          competencies_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;

        CREATE INDEX interviews_updated_at_idx ON interviews(updated_at DESC);

        CREATE TABLE interview_documents (
          id TEXT PRIMARY KEY,
          interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('job_description', 'resume', 'rubric')),
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(interview_id, kind)
        ) STRICT;

        CREATE INDEX interview_documents_interview_idx ON interview_documents(interview_id);

        CREATE TABLE knowledge_chunks (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES interview_documents(id) ON DELETE CASCADE,
          interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
          ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
          content TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          embedding_status TEXT NOT NULL DEFAULT 'pending' CHECK (embedding_status IN ('pending', 'processing', 'ready', 'failed')),
          embedding_model TEXT,
          embedding_dimensions INTEGER,
          embedding_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(document_id, ordinal)
        ) STRICT;

        CREATE INDEX knowledge_chunks_interview_idx ON knowledge_chunks(interview_id);
        CREATE INDEX knowledge_chunks_embedding_status_idx ON knowledge_chunks(embedding_status);

        CREATE VIRTUAL TABLE knowledge_chunks_fts USING fts5(
          content,
          content='knowledge_chunks',
          content_rowid='rowid',
          tokenize='trigram'
        );

        CREATE TRIGGER knowledge_chunks_ai AFTER INSERT ON knowledge_chunks BEGIN
          INSERT INTO knowledge_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
        END;
        CREATE TRIGGER knowledge_chunks_ad AFTER DELETE ON knowledge_chunks BEGIN
          INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
        END;
        CREATE TRIGGER knowledge_chunks_au AFTER UPDATE OF content ON knowledge_chunks BEGIN
          INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
          INSERT INTO knowledge_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
        END;

        CREATE TABLE interview_turns (
          id TEXT PRIMARY KEY,
          interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
          ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
          role TEXT NOT NULL CHECK (role IN ('system', 'interviewer', 'candidate')),
          content TEXT NOT NULL,
          question_kind TEXT,
          decision_json TEXT,
          created_at TEXT NOT NULL,
          UNIQUE(interview_id, ordinal)
        ) STRICT;

        CREATE INDEX interview_turns_interview_idx ON interview_turns(interview_id, ordinal);

        CREATE TABLE assessments (
          id TEXT PRIMARY KEY,
          interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
          turn_id TEXT REFERENCES interview_turns(id) ON DELETE CASCADE,
          dimension TEXT NOT NULL,
          score REAL,
          confidence REAL,
          rationale TEXT NOT NULL,
          evidence_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE INDEX assessments_interview_idx ON assessments(interview_id);

        CREATE TABLE retrieval_sources (
          id TEXT PRIMARY KEY,
          interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
          turn_id TEXT REFERENCES interview_turns(id) ON DELETE CASCADE,
          chunk_id TEXT NOT NULL REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
          rank INTEGER NOT NULL CHECK (rank >= 0),
          score REAL,
          retrieval_kind TEXT NOT NULL CHECK (retrieval_kind IN ('keyword', 'vector', 'hybrid')),
          created_at TEXT NOT NULL,
          UNIQUE(turn_id, chunk_id)
        ) STRICT;

        CREATE TABLE embedding_jobs (
          id TEXT PRIMARY KEY,
          chunk_id TEXT NOT NULL REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
          model TEXT NOT NULL,
          dimensions INTEGER NOT NULL CHECK (dimensions > 0),
          status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
          attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
          error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(chunk_id, model)
        ) STRICT;
        `);
        this.database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
          .run(1, new Date().toISOString());
        this.database.exec("COMMIT");
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    }

    if (currentVersion < 2) {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database.exec(`
          CREATE TABLE job_postings (
            id TEXT PRIMARY KEY,
            source TEXT NOT NULL CHECK (source IN ('alibaba', 'bytedance')),
            source_job_id TEXT NOT NULL,
            source_code TEXT NOT NULL DEFAULT '',
            company TEXT NOT NULL,
            title TEXT NOT NULL,
            city TEXT NOT NULL DEFAULT '',
            job_type TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT '',
            batch TEXT NOT NULL DEFAULT '',
            department TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            responsibilities_json TEXT NOT NULL DEFAULT '[]',
            requirements_json TEXT NOT NULL DEFAULT '[]',
            raw_text TEXT NOT NULL,
            source_url TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            collected_at TEXT NOT NULL,
            first_seen_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            UNIQUE(source, source_job_id)
          ) STRICT;

          CREATE INDEX job_postings_last_seen_idx ON job_postings(last_seen_at DESC);
          CREATE INDEX job_postings_source_idx ON job_postings(source, last_seen_at DESC);

          CREATE VIRTUAL TABLE job_postings_fts USING fts5(
            title,
            city,
            category,
            department,
            description,
            requirements,
            content='job_postings',
            content_rowid='rowid',
            tokenize='trigram'
          );

          CREATE TRIGGER job_postings_ai AFTER INSERT ON job_postings BEGIN
            INSERT INTO job_postings_fts(rowid, title, city, category, department, description, requirements)
            VALUES (new.rowid, new.title, new.city, new.category, new.department, new.description, new.requirements_json);
          END;
          CREATE TRIGGER job_postings_ad AFTER DELETE ON job_postings BEGIN
            INSERT INTO job_postings_fts(job_postings_fts, rowid, title, city, category, department, description, requirements)
            VALUES ('delete', old.rowid, old.title, old.city, old.category, old.department, old.description, old.requirements_json);
          END;
          CREATE TRIGGER job_postings_au AFTER UPDATE ON job_postings BEGIN
            INSERT INTO job_postings_fts(job_postings_fts, rowid, title, city, category, department, description, requirements)
            VALUES ('delete', old.rowid, old.title, old.city, old.category, old.department, old.description, old.requirements_json);
            INSERT INTO job_postings_fts(rowid, title, city, category, department, description, requirements)
            VALUES (new.rowid, new.title, new.city, new.category, new.department, new.description, new.requirements_json);
          END;

          CREATE TABLE job_collection_runs (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed')),
            sources_json TEXT NOT NULL,
            keywords_json TEXT NOT NULL,
            limit_per_source INTEGER NOT NULL CHECK (limit_per_source BETWEEN 1 AND 100),
            results_json TEXT NOT NULL DEFAULT '[]',
            started_at TEXT NOT NULL,
            finished_at TEXT
          ) STRICT;

          CREATE INDEX job_collection_runs_started_idx ON job_collection_runs(started_at DESC);
        `);
        this.database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
          .run(2, new Date().toISOString());
        this.database.exec("COMMIT");
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    }

    if (currentVersion < 3) {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database.exec(`
          CREATE TABLE model_invocations (
            id TEXT PRIMARY KEY,
            interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
            operation_id TEXT NOT NULL,
            purpose TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'interrupted')),
            provider_id TEXT,
            model_id TEXT,
            prompt_version TEXT NOT NULL,
            request_hash TEXT NOT NULL DEFAULT '',
            response_hash TEXT NOT NULL DEFAULT '',
            input_tokens INTEGER,
            output_tokens INTEGER,
            total_tokens INTEGER,
            cached_input_tokens INTEGER,
            reasoning_tokens INTEGER,
            cost_usd REAL,
            duration_ms INTEGER,
            error_code TEXT,
            error_message TEXT,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            UNIQUE(interview_id, operation_id, purpose)
          ) STRICT;

          CREATE INDEX model_invocations_interview_idx
          ON model_invocations(interview_id, started_at DESC);

          CREATE TABLE interview_plans (
            id TEXT PRIMARY KEY,
            interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
            version INTEGER NOT NULL CHECK (version > 0),
            operation_id TEXT NOT NULL,
            prompt_version TEXT NOT NULL,
            model_invocation_id TEXT NOT NULL REFERENCES model_invocations(id),
            question_count INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 30),
            competencies_json TEXT NOT NULL,
            job_description_hash TEXT NOT NULL,
            resume_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(interview_id, version),
            UNIQUE(interview_id, operation_id)
          ) STRICT;

          CREATE INDEX interview_plans_interview_idx
          ON interview_plans(interview_id, version DESC);

          CREATE TABLE interview_questions (
            id TEXT PRIMARY KEY,
            interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
            plan_id TEXT NOT NULL REFERENCES interview_plans(id) ON DELETE CASCADE,
            ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
            competency TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('technical', 'project', 'behavioral', 'scenario')),
            difficulty TEXT NOT NULL CHECK (difficulty IN ('introductory', 'intermediate', 'advanced')),
            prompt TEXT NOT NULL,
            rubric_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(plan_id, ordinal)
          ) STRICT;

          CREATE INDEX interview_questions_interview_idx
          ON interview_questions(interview_id, plan_id, ordinal);

          ALTER TABLE interviews ADD COLUMN active_plan_id TEXT REFERENCES interview_plans(id);
          ALTER TABLE interviews ADD COLUMN active_question_id TEXT REFERENCES interview_questions(id);
          ALTER TABLE interviews ADD COLUMN state_version INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE interviews ADD COLUMN active_operation_id TEXT;
          ALTER TABLE interviews ADD COLUMN preparation_error_code TEXT;
          ALTER TABLE interviews ADD COLUMN preparation_error_message TEXT;
          ALTER TABLE interviews ADD COLUMN started_at TEXT;
          ALTER TABLE interviews ADD COLUMN completed_at TEXT;
          ALTER TABLE interviews ADD COLUMN completion_reason TEXT;

          ALTER TABLE interview_turns ADD COLUMN plan_id TEXT REFERENCES interview_plans(id);
          ALTER TABLE interview_turns ADD COLUMN question_id TEXT REFERENCES interview_questions(id);
          ALTER TABLE interview_turns ADD COLUMN operation_id TEXT;

          CREATE UNIQUE INDEX interview_turns_operation_idx
          ON interview_turns(interview_id, operation_id)
          WHERE operation_id IS NOT NULL;

          CREATE UNIQUE INDEX interview_turns_candidate_question_idx
          ON interview_turns(interview_id, question_id)
          WHERE role = 'candidate' AND question_id IS NOT NULL;
        `);
        this.database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
          .run(3, new Date().toISOString());
        this.database.exec("COMMIT");
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    }

    if (currentVersion < 4) {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database.exec(QUESTION_BANK_SCHEMA_SQL);
        this.database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
          .run(4, new Date().toISOString());
        this.database.exec("COMMIT");
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    }

    if (currentVersion < 5) this.migrateQuestionBankSchemaToV5();
    if (currentVersion < 6) this.migrateQuestionPracticeSchemaToV6();
    if (currentVersion < 7) this.migrateQuestionPracticeTimingSchemaToV7();
  }

  private hasTableColumn(table: string, column: string): boolean {
    return this.database.prepare(`
      SELECT 1 AS found
      FROM pragma_table_info(?)
      WHERE name = ?
      LIMIT 1
    `).get(table, column) !== undefined;
  }

  private hasSchemaObject(type: "table" | "index" | "trigger", name: string): boolean {
    return this.database.prepare(`
      SELECT 1 AS found
      FROM sqlite_master
      WHERE type = ? AND name = ?
      LIMIT 1
    `).get(type, name) !== undefined;
  }

  private hasUniqueColumns(table: string, columns: string[]): boolean {
    const indexes = this.database.prepare(`
      SELECT name
      FROM pragma_index_list(?)
      WHERE [unique] = 1
    `).all(table) as unknown as Array<{ name: string }>;
    return indexes.some((index) => {
      const indexedColumns = this.database.prepare(`
        SELECT name
        FROM pragma_index_info(?)
        ORDER BY seqno
      `).all(index.name) as unknown as Array<{ name: string }>;
      return indexedColumns.length === columns.length
        && indexedColumns.every((entry, position) => entry.name === columns[position]);
    });
  }

  private isQuestionBankV5Shape(): boolean {
    const tables = [
      "question_bank_items",
      "question_versions",
      "question_versions_fts",
      "question_sources",
      "question_version_sources",
      "question_tags",
      "question_version_tags",
      "question_rubric_items",
      "question_followups",
      "question_user_state",
      "question_imports",
    ];
    const indexes = [
      "question_bank_items_status_updated_idx",
      "question_versions_question_idx",
      "question_sources_kind_idx",
      "question_sources_uri_idx",
      "question_version_sources_source_idx",
      "question_tags_axis_label_idx",
      "question_user_state_favorite_idx",
      "question_imports_package_idx",
    ];
    const triggers = ["question_versions_ai", "question_versions_ad", "question_versions_au"];
    return tables.every((table) => this.hasSchemaObject("table", table))
      && indexes.every((index) => this.hasSchemaObject("index", index))
      && triggers.every((trigger) => this.hasSchemaObject("trigger", trigger))
      && this.hasTableColumn("question_bank_items", "published_version_id")
      && this.hasTableColumn("question_versions", "search_text")
      && this.hasTableColumn("question_versions_fts", "search_text")
      && this.hasTableColumn("question_version_tags", "label")
      && this.hasTableColumn("question_rubric_items", "rubric_key")
      && this.hasUniqueColumns("question_versions", ["question_id", "version"])
      && !this.hasUniqueColumns("question_versions", ["question_id", "content_hash"])
      && this.hasUniqueColumns("question_rubric_items", ["version_id", "rubric_key"])
      && this.hasUniqueColumns("question_imports", ["package_id", "package_version"]);
  }

  private migrateQuestionBankSchemaToV5(): void {
    // Schema v4 existed in two incompatible shapes. The question bank is rebuildable,
    // while interview plans and snapshots are not, so only reset the question_* subgraph.
    const resetQuestionBank = !this.isQuestionBankV5Shape();
    const foreignKeysEnabled = Number((this.database.prepare("PRAGMA foreign_keys").get() as {
      foreign_keys: number;
    }).foreign_keys) === 1;

    if (resetQuestionBank && foreignKeysEnabled) this.database.exec("PRAGMA foreign_keys = OFF");
    try {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        if (resetQuestionBank) {
          this.database.exec(`
            DROP TRIGGER IF EXISTS question_versions_ai;
            DROP TRIGGER IF EXISTS question_versions_ad;
            DROP TRIGGER IF EXISTS question_versions_au;
            DROP TABLE IF EXISTS question_versions_fts;
            DROP TABLE IF EXISTS question_imports;
            DROP TABLE IF EXISTS question_user_state;
            DROP TABLE IF EXISTS question_followups;
            DROP TABLE IF EXISTS question_rubric_items;
            DROP TABLE IF EXISTS question_version_tags;
            DROP TABLE IF EXISTS question_version_sources;
            DROP TABLE IF EXISTS question_tags;
            DROP TABLE IF EXISTS question_sources;
            DROP TABLE IF EXISTS question_versions;
            DROP TABLE IF EXISTS question_bank_items;
          `);
          this.database.exec(QUESTION_BANK_SCHEMA_SQL);
        }

        if (!this.isQuestionBankV5Shape()) throw new Error("题库数据库 v5 迁移后结构校验失败");
        const foreignKeyViolations = this.database.prepare("PRAGMA foreign_key_check").all();
        if (foreignKeyViolations.length > 0) throw new Error("题库数据库 v5 迁移后外键校验失败");
        this.database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
          .run(5, new Date().toISOString());
        this.database.exec("COMMIT");
      } catch (error) {
        if (this.database.isTransaction) this.database.exec("ROLLBACK");
        throw error;
      }
    } finally {
      if (resetQuestionBank && foreignKeysEnabled) this.database.exec("PRAGMA foreign_keys = ON");
    }
  }

  private migrateQuestionPracticeSchemaToV6(): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.exec(QUESTION_PRACTICE_SCHEMA_SQL);
      const foreignKeyViolations = this.database.prepare("PRAGMA foreign_key_check").all();
      if (foreignKeyViolations.length > 0) throw new Error("题库练习数据库 v6 迁移后外键校验失败");
      this.database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(6, new Date().toISOString());
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private migrateQuestionPracticeTimingSchemaToV7(): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      // Early v6 builds created the practice tables before elapsed draft time was
      // persisted. Keep the migration additive so existing sessions and answers
      // survive the upgrade. Fresh v6 migrations already use the latest table
      // definition, hence the shape check before ALTER TABLE.
      if (!this.hasTableColumn("question_practice_items", "draft_elapsed_seconds")) {
        this.database.exec(`
          ALTER TABLE question_practice_items
          ADD COLUMN draft_elapsed_seconds INTEGER NOT NULL DEFAULT 0
            CHECK (draft_elapsed_seconds BETWEEN 0 AND 604800);
        `);
      }
      const foreignKeyViolations = this.database.prepare("PRAGMA foreign_key_check").all();
      if (foreignKeyViolations.length > 0) throw new Error("题库练习数据库 v7 迁移后外键校验失败");
      this.database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(7, new Date().toISOString());
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private recoverInterruptedPreparation(): void {
    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`
        UPDATE model_invocations
        SET status = 'interrupted', error_code = 'interrupted',
            error_message = '上次准备因客户端退出而中断', finished_at = COALESCE(finished_at, ?)
        WHERE status = 'running'
      `).run(now);
      this.database.prepare(`
        UPDATE interviews
        SET status = CASE WHEN active_plan_id IS NULL THEN 'draft' ELSE 'ready' END,
            active_operation_id = NULL,
            preparation_error_code = 'interrupted',
            preparation_error_message = '上次准备因客户端退出而中断，可重新准备',
            state_version = state_version + 1,
            updated_at = ?
        WHERE status = 'preparing'
      `).run(now);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
