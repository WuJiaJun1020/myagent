import { join } from "node:path";
import type {
  InterviewCreateRequest,
  InterviewPreparationProgress,
  InterviewPrepareRequest,
  InterviewRecord,
  InterviewSession,
  InterviewSnapshot,
  JobCollectionProgress,
  JobCollectionRequest,
  JobCollectionResult,
  JobCollectionSourceResult,
  JobLibrarySnapshot,
  JobSource,
} from "../../shared/contracts/interview";
import {
  INTERVIEW_QUESTION_DIFFICULTIES,
  INTERVIEW_QUESTION_KINDS,
} from "../../shared/contracts/interview";
import type {
  QuestionBankFavoriteRequest,
  QuestionBankFavoriteResult,
  QuestionBankListQuery,
  QuestionBankListResult,
  QuestionBankQuestionDetail,
  QuestionBankSnapshot,
} from "../../shared/contracts/interview-question-bank";
import {
  QUESTION_PRACTICE_SELF_RATINGS,
  type QuestionPracticeAbandonRequest,
  type QuestionPracticeCompleteReviewRequest,
  type QuestionPracticeHistoryQuery,
  type QuestionPracticeHistoryResult,
  type QuestionPracticeOverview,
  type QuestionPracticeSaveDraftRequest,
  type QuestionPracticeSaveDraftResult,
  type QuestionPracticeSession,
  type QuestionPracticeSkipRequest,
  type QuestionPracticeStartRequest,
  type QuestionPracticeSubmitAnswerRequest,
} from "../../shared/contracts/interview-question-practice";
import { InterviewDatabase } from "./interview-database";
import {
  INTERVIEW_PREPARE_QUESTIONS_PROMPT_VERSION,
  type InterviewModelProvider,
} from "./interview-model-provider";
import type { InterviewJobCollector } from "./job-collector";
import { loadQuestionBankCatalog } from "./question-bank-catalog";
import { LanceDbInterviewVectorStore, type InterviewVectorStore } from "./interview-vector-store";

type ActivePreparation = {
  operationId: string;
  controller: AbortController;
  task: Promise<InterviewSession>;
};

function requiredText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label}无效`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label}不能为空`);
  if (normalized.length > maximum) throw new Error(`${label}不能超过 ${maximum.toLocaleString()} 个字符`);
  return normalized;
}

function strictRecord(value: unknown, label: string, allowedKeys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}无效`);
  const record = value as Record<string, unknown>;
  const unknownKey = Object.keys(record).find((key) => !allowedKeys.includes(key));
  if (unknownKey) throw new Error(`${label}包含未知字段：${unknownKey}`);
  return record;
}

function identifier(value: unknown, label: string, maximum = 160): string {
  const parsed = requiredText(value, label, maximum);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(parsed)) throw new Error(`${label}无效`);
  return parsed;
}

function safeInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label}必须在 ${minimum.toLocaleString()} 到 ${maximum.toLocaleString()} 之间`);
  }
  return value;
}

function optionalText(value: unknown, label: string, maximum: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, label, maximum);
}

function requiredContentText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label}无效`);
  if (!value.trim()) throw new Error(`${label}不能为空`);
  if (value.length > maximum) throw new Error(`${label}不能超过 ${maximum.toLocaleString()} 个字符`);
  return value;
}

function parseCreateRequest(value: unknown): InterviewCreateRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("面试创建参数无效");
  const request = value as Record<string, unknown>;
  const title = request.title === undefined || request.title === ""
    ? undefined
    : requiredText(request.title, "面试名称", 160);
  if (!Number.isInteger(request.questionCount) || Number(request.questionCount) < 1 || Number(request.questionCount) > 30) {
    throw new Error("面试题数必须在 1 到 30 之间");
  }
  if (!Array.isArray(request.competencies) || request.competencies.length < 1 || request.competencies.length > 8) {
    throw new Error("请选择 1 到 8 个能力维度");
  }
  const competencies = [...new Set(request.competencies.map((item) => requiredText(item, "能力维度", 40)))];
  if (competencies.length !== request.competencies.length) throw new Error("能力维度不能重复");

  return {
    title,
    candidateName: requiredText(request.candidateName, "候选人姓名", 100),
    positionTitle: requiredText(request.positionTitle, "目标岗位", 120),
    jobDescription: requiredText(request.jobDescription, "岗位描述", 200_000),
    resumeText: requiredText(request.resumeText, "简历内容", 500_000),
    questionCount: Number(request.questionCount),
    competencies,
  };
}

function parseJobCollectionRequest(value: unknown): JobCollectionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("岗位采集参数无效");
  const request = value as Record<string, unknown>;
  if (!Array.isArray(request.sources) || request.sources.length < 1 || request.sources.length > 2) {
    throw new Error("请选择至少一个采集来源");
  }
  const sources = [...new Set(request.sources)] as unknown[];
  if (!sources.every((source) => source === "alibaba" || source === "bytedance")) throw new Error("岗位采集来源无效");
  if (!Array.isArray(request.keywords) || request.keywords.length < 1 || request.keywords.length > 8) {
    throw new Error("请输入 1 到 8 个搜索关键词");
  }
  const keywords = [...new Set(request.keywords.map((keyword) => requiredText(keyword, "搜索关键词", 50)))];
  if (keywords.length !== request.keywords.length) throw new Error("搜索关键词不能重复");
  if (!Number.isInteger(request.limitPerSource) || Number(request.limitPerSource) < 1 || Number(request.limitPerSource) > 100) {
    throw new Error("每个来源的采集上限必须在 1 到 100 之间");
  }
  return {
    sources: sources as JobSource[],
    keywords,
    limitPerSource: Number(request.limitPerSource),
  };
}

function parsePrepareRequest(value: unknown): InterviewPrepareRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("面试准备参数无效");
  const request = value as Record<string, unknown>;
  const interviewId = requiredText(request.interviewId, "面试 ID", 100);
  const operationId = requiredText(request.operationId, "准备操作 ID", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(operationId)) throw new Error("准备操作 ID 无效");
  if (request.privacyConfirmed !== true) {
    throw new Error("请先确认将岗位描述与简历发送给当前配置的模型 Provider");
  }
  return { interviewId, operationId, privacyConfirmed: true };
}

function optionalFilterText(value: unknown, label: string, maximum = 100): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, label, maximum);
}

function parseQuestionBankListQuery(value: unknown): QuestionBankListQuery {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("题库筛选参数无效");
  const query = value as Record<string, unknown>;
  const kind = optionalFilterText(query.kind, "题目类型", 40);
  if (kind && !INTERVIEW_QUESTION_KINDS.includes(kind as never)) throw new Error("题目类型无效");
  const difficulty = optionalFilterText(query.difficulty, "题目难度", 40);
  if (difficulty && !INTERVIEW_QUESTION_DIFFICULTIES.includes(difficulty as never)) throw new Error("题目难度无效");
  if (query.favoritesOnly !== undefined && typeof query.favoritesOnly !== "boolean") {
    throw new Error("收藏筛选参数无效");
  }
  const limit = query.limit;
  if (limit !== undefined && (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)) {
    throw new Error("题库每页数量必须在 1 到 100 之间");
  }
  const offset = query.offset;
  if (offset !== undefined && (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000)) {
    throw new Error("题库分页位置无效");
  }
  return {
    ...(optionalFilterText(query.search, "搜索关键词", 200) ? { search: String(query.search).trim() } : {}),
    ...(kind ? { kind: kind as QuestionBankListQuery["kind"] } : {}),
    ...(difficulty ? { difficulty: difficulty as QuestionBankListQuery["difficulty"] } : {}),
    ...(optionalFilterText(query.role, "岗位筛选", 100) ? { role: String(query.role).trim() } : {}),
    ...(optionalFilterText(query.skill, "技能筛选", 100) ? { skill: String(query.skill).trim() } : {}),
    ...(query.favoritesOnly === true ? { favoritesOnly: true } : {}),
    ...(limit === undefined ? {} : { limit }),
    ...(offset === undefined ? {} : { offset }),
  };
}

function parseQuestionBankFavoriteRequest(value: unknown): QuestionBankFavoriteRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("收藏参数无效");
  const request = value as Record<string, unknown>;
  if (typeof request.favorite !== "boolean") throw new Error("收藏状态无效");
  return {
    questionId: requiredText(request.questionId, "题目 ID", 160),
    favorite: request.favorite,
  };
}

const QUESTION_PRACTICE_FILTER_KEYS = [
  "search",
  "kind",
  "difficulty",
  "role",
  "skill",
  "favoritesOnly",
] as const;

function parseQuestionPracticeFilter(value: unknown): QuestionBankListQuery {
  const query = strictRecord(value, "练习筛选参数", QUESTION_PRACTICE_FILTER_KEYS);
  return parseQuestionBankListQuery(query);
}

function parseQuestionPracticeStartRequest(value: unknown): QuestionPracticeStartRequest {
  const request = strictRecord(value, "练习创建参数", ["operationId", "selection"]);
  const operationId = identifier(request.operationId, "练习操作 ID", 128);
  const selection = strictRecord(request.selection, "练习选题参数", [
    "kind",
    "questionId",
    "expectedVersion",
    "query",
    "count",
    "order",
  ]);

  if (selection.kind === "single") {
    const presentKeys = Object.keys(selection);
    const unexpected = presentKeys.find((key) => !["kind", "questionId", "expectedVersion"].includes(key));
    if (unexpected) throw new Error(`单题练习参数包含未知字段：${unexpected}`);
    return {
      operationId,
      selection: {
        kind: "single",
        questionId: identifier(selection.questionId, "题目 ID"),
        ...(selection.expectedVersion === undefined
          ? {}
          : { expectedVersion: safeInteger(selection.expectedVersion, "题目版本", 1, 1_000_000) }),
      },
    };
  }

  if (selection.kind === "filtered") {
    const presentKeys = Object.keys(selection);
    const unexpected = presentKeys.find((key) => !["kind", "query", "count", "order"].includes(key));
    if (unexpected) throw new Error(`筛选练习参数包含未知字段：${unexpected}`);
    if (selection.order !== "random" && selection.order !== "latest") throw new Error("练习题目顺序无效");
    return {
      operationId,
      selection: {
        kind: "filtered",
        query: parseQuestionPracticeFilter(selection.query),
        count: safeInteger(selection.count, "练习题数", 1, 100),
        order: selection.order,
      },
    };
  }

  throw new Error("练习选题类型无效");
}

function parseQuestionPracticeSaveDraftRequest(value: unknown): QuestionPracticeSaveDraftRequest {
  const request = strictRecord(value, "练习草稿参数", [
    "sessionId",
    "itemId",
    "draftRevision",
    "answer",
    "elapsedSeconds",
  ]);
  if (typeof request.answer !== "string") throw new Error("练习回答无效");
  if (request.answer.length > 100_000) throw new Error("练习回答不能超过 100,000 个字符");
  return {
    sessionId: identifier(request.sessionId, "练习批次 ID"),
    itemId: identifier(request.itemId, "练习题目 ID"),
    draftRevision: safeInteger(request.draftRevision, "草稿版本", 0, 1_000_000_000),
    answer: request.answer,
    ...(request.elapsedSeconds === undefined
      ? {}
      : { elapsedSeconds: safeInteger(request.elapsedSeconds, "练习用时", 0, 604_800) }),
  };
}

function parseQuestionPracticeSubmitAnswerRequest(value: unknown): QuestionPracticeSubmitAnswerRequest {
  const request = strictRecord(value, "练习提交参数", [
    "sessionId",
    "itemId",
    "operationId",
    "expectedStateVersion",
    "draftRevision",
    "answer",
    "elapsedSeconds",
  ]);
  return {
    sessionId: identifier(request.sessionId, "练习批次 ID"),
    itemId: identifier(request.itemId, "练习题目 ID"),
    operationId: identifier(request.operationId, "练习操作 ID", 128),
    expectedStateVersion: safeInteger(request.expectedStateVersion, "练习状态版本", 0, 1_000_000_000),
    draftRevision: safeInteger(request.draftRevision, "草稿版本", 0, 1_000_000_000),
    answer: requiredContentText(request.answer, "练习回答", 100_000),
    ...(request.elapsedSeconds === undefined
      ? {}
      : { elapsedSeconds: safeInteger(request.elapsedSeconds, "练习用时", 0, 604_800) }),
  };
}

function parseQuestionPracticeCompleteReviewRequest(value: unknown): QuestionPracticeCompleteReviewRequest {
  const request = strictRecord(value, "练习复盘参数", [
    "sessionId",
    "itemId",
    "operationId",
    "expectedStateVersion",
    "selfRating",
    "coveredRubricIds",
    "note",
  ]);
  if (typeof request.selfRating !== "string" || !QUESTION_PRACTICE_SELF_RATINGS.includes(request.selfRating as never)) {
    throw new Error("练习自评等级无效");
  }
  if (!Array.isArray(request.coveredRubricIds) || request.coveredRubricIds.length > 20) {
    throw new Error("练习评分点无效");
  }
  const coveredRubricIds = request.coveredRubricIds.map((rubricId) =>
    identifier(rubricId, "评分点 ID", 80));
  if (new Set(coveredRubricIds).size !== coveredRubricIds.length) throw new Error("评分点不能重复");
  return {
    sessionId: identifier(request.sessionId, "练习批次 ID"),
    itemId: identifier(request.itemId, "练习题目 ID"),
    operationId: identifier(request.operationId, "练习操作 ID", 128),
    expectedStateVersion: safeInteger(request.expectedStateVersion, "练习状态版本", 0, 1_000_000_000),
    selfRating: request.selfRating as QuestionPracticeCompleteReviewRequest["selfRating"],
    coveredRubricIds,
    ...(optionalText(request.note, "练习复盘备注", 4_000) ? { note: String(request.note).trim() } : {}),
  };
}

function parseQuestionPracticeSkipRequest(value: unknown): QuestionPracticeSkipRequest {
  const request = strictRecord(value, "跳过题目参数", [
    "sessionId",
    "itemId",
    "operationId",
    "expectedStateVersion",
  ]);
  return {
    sessionId: identifier(request.sessionId, "练习批次 ID"),
    itemId: identifier(request.itemId, "练习题目 ID"),
    operationId: identifier(request.operationId, "练习操作 ID", 128),
    expectedStateVersion: safeInteger(request.expectedStateVersion, "练习状态版本", 0, 1_000_000_000),
  };
}

function parseQuestionPracticeAbandonRequest(value: unknown): QuestionPracticeAbandonRequest {
  const request = strictRecord(value, "放弃练习参数", ["sessionId", "operationId", "expectedStateVersion"]);
  return {
    sessionId: identifier(request.sessionId, "练习批次 ID"),
    operationId: identifier(request.operationId, "练习操作 ID", 128),
    expectedStateVersion: safeInteger(request.expectedStateVersion, "练习状态版本", 0, 1_000_000_000),
  };
}

function parseQuestionPracticeHistoryQuery(value: unknown): QuestionPracticeHistoryQuery {
  if (value === undefined || value === null) return {};
  const query = strictRecord(value, "练习历史参数", ["limit", "offset"]);
  return {
    ...(query.limit === undefined ? {} : { limit: safeInteger(query.limit, "练习历史每页数量", 1, 100) }),
    ...(query.offset === undefined ? {} : { offset: safeInteger(query.offset, "练习历史分页位置", 0, 1_000_000) }),
  };
}

export class InterviewService {
  private database?: InterviewDatabase;
  private activeCollection?: Promise<JobCollectionResult>;
  private activeCollectionAbort?: AbortController;
  private readonly activePreparations = new Map<string, ActivePreparation>();
  private closeTask?: Promise<void>;
  private closing = false;
  private questionBankInitialization?: Promise<void>;
  readonly vectors: InterviewVectorStore;

  constructor(
    private readonly dataDirectory: string,
    vectorStore?: InterviewVectorStore,
    private readonly jobCollector?: InterviewJobCollector,
    private readonly modelProvider?: InterviewModelProvider,
    private readonly questionBankResourceDirectory?: string,
  ) {
    this.vectors = vectorStore ?? new LanceDbInterviewVectorStore(join(dataDirectory, "vectors", "lancedb"));
  }

  getSnapshot(): InterviewSnapshot {
    return this.getDatabase().getSnapshot();
  }

  getInterview(value: unknown): InterviewRecord | null {
    const id = requiredText(value, "面试 ID", 100);
    return this.getDatabase().getInterview(id);
  }

  getInterviewSession(value: unknown): InterviewSession | null {
    const id = requiredText(value, "面试 ID", 100);
    return this.getDatabase().getInterviewSession(id);
  }

  createInterview(value: unknown): InterviewRecord {
    return this.getDatabase().createInterview(parseCreateRequest(value));
  }

  prepareInterview(
    value: unknown,
    onProgress: (progress: InterviewPreparationProgress) => void = () => undefined,
  ): Promise<InterviewSession> {
    if (!this.modelProvider) return Promise.reject(new Error("当前运行时未配置面试模型服务"));
    if (this.closing) return Promise.reject(new Error("面试模块正在关闭，无法准备面试"));
    let request: InterviewPrepareRequest;
    try {
      request = parsePrepareRequest(value);
    } catch (error) {
      return Promise.reject(error);
    }
    const active = this.activePreparations.get(request.interviewId);
    if (active) {
      if (active.operationId === request.operationId) return active.task;
      return Promise.reject(new Error("该面试正在准备中"));
    }

    let database: InterviewDatabase;
    let claim: ReturnType<InterviewDatabase["claimInterviewPreparation"]>;
    try {
      database = this.getDatabase();
      claim = database.claimInterviewPreparation(
        request.interviewId,
        request.operationId,
        INTERVIEW_PREPARE_QUESTIONS_PROMPT_VERSION,
      );
    } catch (error) {
      return Promise.reject(error);
    }
    if (claim === "already_completed") {
      const session = database.getInterviewSession(request.interviewId);
      if (!session) return Promise.reject(new Error("面试不存在"));
      return Promise.resolve(session);
    }
    if (claim === "already_running") {
      return Promise.reject(new Error("该面试正在准备中，请稍后重试"));
    }

    const controller = new AbortController();
    const task = this.runInterviewPreparation(request, database, onProgress, controller.signal);
    this.activePreparations.set(request.interviewId, {
      operationId: request.operationId,
      controller,
      task,
    });
    void task.finally(() => {
      const current = this.activePreparations.get(request.interviewId);
      if (current?.task === task) this.activePreparations.delete(request.interviewId);
    }).catch(() => undefined);
    return task;
  }

  getJobLibrary(): JobLibrarySnapshot {
    return this.getDatabase().getJobLibrary();
  }

  async getQuestionBankSnapshot(): Promise<QuestionBankSnapshot> {
    await this.ensureQuestionBankReady();
    return this.getDatabase().getQuestionBankSnapshot();
  }

  async listQuestionBankQuestions(value: unknown): Promise<QuestionBankListResult> {
    const query = parseQuestionBankListQuery(value);
    await this.ensureQuestionBankReady();
    return this.getDatabase().listQuestionBank(query);
  }

  async getQuestionBankQuestion(value: unknown): Promise<QuestionBankQuestionDetail | null> {
    const id = requiredText(value, "题目 ID", 160);
    await this.ensureQuestionBankReady();
    return this.getDatabase().getQuestionBankItem(id);
  }

  async setQuestionBankFavorite(value: unknown): Promise<QuestionBankFavoriteResult> {
    const request = parseQuestionBankFavoriteRequest(value);
    await this.ensureQuestionBankReady();
    return this.getDatabase().setQuestionFavorite(request.questionId, request.favorite);
  }

  async getQuestionPracticeOverview(): Promise<QuestionPracticeOverview> {
    return this.getDatabase().getQuestionPracticeOverview();
  }

  async startQuestionPractice(value: unknown): Promise<QuestionPracticeSession> {
    const request = parseQuestionPracticeStartRequest(value);
    await this.ensureQuestionBankReady();
    return this.getDatabase().startQuestionPractice(request);
  }

  async getQuestionPracticeSession(value: unknown): Promise<QuestionPracticeSession | null> {
    const sessionId = identifier(value, "练习批次 ID");
    return this.getDatabase().getQuestionPracticeSession(sessionId);
  }

  async saveQuestionPracticeDraft(value: unknown): Promise<QuestionPracticeSaveDraftResult> {
    const request = parseQuestionPracticeSaveDraftRequest(value);
    return this.getDatabase().saveQuestionPracticeDraft(request);
  }

  async submitQuestionPracticeAnswer(value: unknown): Promise<QuestionPracticeSession> {
    const request = parseQuestionPracticeSubmitAnswerRequest(value);
    return this.getDatabase().submitQuestionPracticeAnswer(request);
  }

  async completeQuestionPracticeReview(value: unknown): Promise<QuestionPracticeSession> {
    const request = parseQuestionPracticeCompleteReviewRequest(value);
    return this.getDatabase().completeQuestionPracticeReview(request);
  }

  async skipQuestionPracticeItem(value: unknown): Promise<QuestionPracticeSession> {
    const request = parseQuestionPracticeSkipRequest(value);
    return this.getDatabase().skipQuestionPracticeItem(request);
  }

  async abandonQuestionPracticeSession(value: unknown): Promise<QuestionPracticeSession> {
    const request = parseQuestionPracticeAbandonRequest(value);
    return this.getDatabase().abandonQuestionPracticeSession(request);
  }

  async listQuestionPracticeHistory(value: unknown): Promise<QuestionPracticeHistoryResult> {
    const query = parseQuestionPracticeHistoryQuery(value);
    return this.getDatabase().listQuestionPracticeHistory(query);
  }

  async collectJobs(
    value: unknown,
    onProgress: (progress: JobCollectionProgress) => void = () => undefined,
  ): Promise<JobCollectionResult> {
    if (!this.jobCollector) throw new Error("当前运行时未配置岗位采集器");
    if (this.closing) throw new Error("面试模块正在关闭，无法开始岗位采集");
    if (this.activeCollection) throw new Error("已有岗位采集任务正在进行");
    const request = parseJobCollectionRequest(value);
    const database = this.getDatabase();
    const started = database.startJobCollection(request);
    const controller = new AbortController();
    this.activeCollectionAbort = controller;
    const task = this.runJobCollection(request, started.id, database, onProgress, controller.signal);
    this.activeCollection = task;

    try {
      return await task;
    } finally {
      if (this.activeCollection === task) this.activeCollection = undefined;
      if (this.activeCollectionAbort === controller) this.activeCollectionAbort = undefined;
    }
  }

  close(): Promise<void> {
    this.closeTask ??= this.closeResources();
    return this.closeTask;
  }

  private async runJobCollection(
    request: JobCollectionRequest,
    runId: string,
    database: InterviewDatabase,
    onProgress: (progress: JobCollectionProgress) => void,
    signal: AbortSignal,
  ): Promise<JobCollectionResult> {
    onProgress({ runId, phase: "starting", message: "已启动官网岗位采集", collected: 0 });

    try {
      const outputs = await this.jobCollector!.collect(
        request,
        (progress) => onProgress({ runId, ...progress }),
        signal,
      );
      const results: JobCollectionSourceResult[] = [];
      for (const output of outputs) {
        signal.throwIfAborted();
        if (output.error) {
          results.push({
            source: output.source,
            status: "failed",
            collected: 0,
            inserted: 0,
            updated: 0,
            unchanged: 0,
            error: output.error,
          });
          continue;
        }
        onProgress({ runId, source: output.source, phase: "saving", message: `正在保存 ${output.jobs.length} 个岗位…`, collected: output.jobs.length });
        const changes = database.upsertJobPostings(output.jobs);
        results.push({ source: output.source, status: "completed", collected: output.jobs.length, ...changes });
      }
      const successful = results.filter((result) => result.status === "completed").length;
      const status = successful === results.length ? "completed" : successful > 0 ? "partial" : "failed";
      const run = database.finishJobCollection(runId, status, results);
      onProgress({
        runId,
        phase: status === "failed" ? "failed" : "completed",
        message: status === "completed" ? "岗位采集完成" : status === "partial" ? "岗位采集部分完成" : "岗位采集失败",
        collected: results.reduce((sum, result) => sum + result.collected, 0),
      });
      return { run, snapshot: database.getJobLibrary() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const results: JobCollectionSourceResult[] = request.sources.map((source) => ({
        source,
        status: "failed",
        collected: 0,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        error: message,
      }));
      database.finishJobCollection(runId, "failed", results);
      onProgress({ runId, phase: "failed", message, collected: 0 });
      throw error;
    }
  }

  private async runInterviewPreparation(
    request: InterviewPrepareRequest,
    database: InterviewDatabase,
    onProgress: (progress: InterviewPreparationProgress) => void,
    signal: AbortSignal,
  ): Promise<InterviewSession> {
    const progress = (
      phase: InterviewPreparationProgress["phase"],
      message: string,
    ): void => onProgress({
      interviewId: request.interviewId,
      operationId: request.operationId,
      phase,
      message,
    });
    progress("validating", "正在校验面试配置");

    const interview = database.getInterview(request.interviewId);
    if (!interview) {
      const message = "面试不存在";
      database.failInterviewPreparation(request.interviewId, request.operationId, {
        errorCode: "invalid_request",
        errorMessage: message,
        durationMs: 0,
      });
      progress("failed", message);
      throw new Error(message);
    }
    const jobDescription = interview.documents.find((document) => document.kind === "job_description");
    const resume = interview.documents.find((document) => document.kind === "resume");
    if (!jobDescription || !resume) {
      const message = "面试缺少岗位描述或简历";
      database.failInterviewPreparation(request.interviewId, request.operationId, {
        errorCode: "invalid_request",
        errorMessage: message,
        durationMs: 0,
      });
      progress("failed", message);
      throw new Error(message);
    }

    progress("calling_model", "正在生成固定面试题目计划");
    const result = await this.modelProvider!.prepareQuestions({
      positionTitle: interview.positionTitle,
      jobDescription: jobDescription.content,
      resumeText: resume.content,
      questionCount: interview.questionCount,
      competencies: interview.competencies,
    }, { signal, traceId: request.operationId });

    if (!result.ok) {
      database.failInterviewPreparation(request.interviewId, request.operationId, {
        errorCode: result.error.code,
        errorMessage: result.error.message,
        providerId: result.invocation.providerId,
        modelId: result.invocation.modelId,
        requestHash: result.invocation.requestHash,
        responseHash: result.invocation.responseHash,
        inputTokens: result.invocation.usage?.inputTokens,
        outputTokens: result.invocation.usage?.outputTokens,
        totalTokens: result.invocation.usage?.totalTokens,
        cachedInputTokens: result.invocation.usage?.cachedInputTokens,
        reasoningTokens: result.invocation.usage?.reasoningTokens,
        costUsd: result.invocation.usage?.costUsd,
        durationMs: result.invocation.durationMs,
      });
      progress("failed", result.error.message);
      throw new Error(result.error.message);
    }

    progress("saving", "正在保存面试题目计划");
    try {
      const session = database.completeInterviewPreparation({
        interviewId: request.interviewId,
        operationId: request.operationId,
        promptVersion: result.value.promptVersion,
        competencies: interview.competencies,
        jobDescriptionHash: jobDescription.contentHash,
        resumeHash: resume.contentHash,
        questions: result.value.questions,
        invocation: {
          providerId: result.invocation.providerId,
          modelId: result.invocation.modelId,
          requestHash: result.invocation.requestHash,
          responseHash: result.invocation.responseHash,
          inputTokens: result.invocation.usage.inputTokens,
          outputTokens: result.invocation.usage.outputTokens,
          totalTokens: result.invocation.usage.totalTokens,
          cachedInputTokens: result.invocation.usage.cachedInputTokens,
          reasoningTokens: result.invocation.usage.reasoningTokens,
          costUsd: result.invocation.usage.costUsd,
          durationMs: result.invocation.durationMs,
        },
      });
      progress("completed", "面试题目计划已准备完成");
      return session;
    } catch {
      const message = "保存面试题目计划失败，请重试";
      database.failInterviewPreparation(request.interviewId, request.operationId, {
        errorCode: "unknown",
        errorMessage: message,
        durationMs: result.invocation.durationMs,
      });
      progress("failed", message);
      throw new Error(message);
    }
  }

  private async closeResources(): Promise<void> {
    this.closing = true;
    this.activeCollectionAbort?.abort(new Error("客户端正在退出，岗位采集已取消"));
    for (const preparation of this.activePreparations.values()) {
      preparation.controller.abort(new Error("客户端正在退出，面试准备已取消"));
    }
    const errors: unknown[] = [];

    try {
      await this.jobCollector?.close();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.activeCollection;
    } catch {
      // Cancellation or collection failure is already reflected in its run and IPC result.
    }
    await Promise.allSettled([...this.activePreparations.values()].map((preparation) => preparation.task));
    if (this.questionBankInitialization) await Promise.allSettled([this.questionBankInitialization]);
    try {
      await this.vectors.close();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.database?.close();
    } catch (error) {
      errors.push(error);
    } finally {
      this.database = undefined;
    }

    if (errors.length > 0) throw new AggregateError(errors, "关闭智能面试服务时发生错误");
  }

  private getDatabase(): InterviewDatabase {
    if (this.closing) throw new Error("面试模块正在关闭");
    this.database ??= new InterviewDatabase(join(this.dataDirectory, "interview.db"));
    return this.database;
  }

  private ensureQuestionBankReady(): Promise<void> {
    if (this.closing) return Promise.reject(new Error("面试模块正在关闭"));
    if (!this.questionBankResourceDirectory) return Promise.resolve();
    if (!this.questionBankInitialization) {
      const initialization = loadQuestionBankCatalog(this.questionBankResourceDirectory)
        .then((catalog) => {
          this.getDatabase().importQuestionBankCatalog(catalog);
        });
      this.questionBankInitialization = initialization;
      void initialization.catch(() => {
        if (this.questionBankInitialization === initialization && !this.closing) {
          this.questionBankInitialization = undefined;
        }
      });
    }
    return this.questionBankInitialization;
  }
}
