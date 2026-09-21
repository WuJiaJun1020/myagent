import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
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

const SCHEMA_VERSION = 3;

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
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

  getSchemaVersion(): number {
    const row = this.database.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number | null };
    return row.version ?? 0;
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
