import { join } from "node:path";
import type {
  InterviewCreateRequest,
  InterviewAlgorithmDraftRequest,
  InterviewAlgorithmSubmitRequest,
  InterviewAlgorithmMode,
  InterviewChatRequest,
  InterviewChatPrompts,
  InterviewChatSettings,
  InterviewCallTrace,
  InterviewDirectorConfig,
  CandidateTurnRequest,
  CandidateTurnResult,
  CandidateTurnProgress,
  InterviewRecord,
  InterviewSession,
  InterviewTurn,
  InterviewScoreRequest,
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
  MAX_INTERVIEW_ROUNDS,
  DEFAULT_DIRECTOR_CHAT_SETTINGS,
  DEFAULT_INTERVIEW_CHAT_MODEL,
  DEFAULT_CANDIDATE_ERROR_RATE,
  INTERVIEW_SCORE_DIMENSIONS,
} from "../../shared/contracts/interview";
import { DEFAULT_INTERVIEW_CHAT_PROMPTS } from "../../shared/interview-chat-prompt";
import { DEFAULT_INTERVIEW_DIRECTOR_PROMPT } from "../../shared/interview-director-prompt";
import { advanceInterviewTopicFlow, checkInterviewTopicPolicy, closeInterviewTopicFlow,
  type DirectorTopicReport } from "../../shared/interview-topic-flow";
import { DEFAULT_INTERVIEW_SCORE_PROMPT } from "../../shared/interview-score";
import type { InterviewDirectorAgent, InterviewDirectorDecision } from "./interview-director-agent";
import { candidateResponseModeTrace,
  chooseCandidateResponseMode, readCandidateResponseMode } from "./candidate-response-mode";
import type { InterviewScoreAgent } from "./interview-score-agent";
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
import type { InterviewJobCollector } from "./job-collector";
import { loadQuestionBankCatalog } from "./question-bank-catalog";
import { LanceDbInterviewVectorStore, type InterviewVectorStore } from "./interview-vector-store";
import type { KnowledgeInterviewImportCounts, KnowledgeInterviewImportPayload } from "../../shared/contracts/knowledge-studio";
import { knowledgeStudioQuestionPackage } from "./knowledge-studio-question-adapter";
import { InterviewChatAgent } from "./interview-chat-agent";
import type { InterviewAlgorithmExecutor } from "./interview-algorithm-exam";

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

function modelIdentifier(value: unknown, label: string, maximum = 160): string {
  const parsed = requiredText(value, label, maximum);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(parsed)) throw new Error(`${label}无效`);
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
  if (request.algorithmEnabled !== undefined && typeof request.algorithmEnabled !== "boolean") {
    throw new Error("算法考核选项无效");
  }
  if (request.directorEnabled !== undefined && typeof request.directorEnabled !== "boolean") {
    throw new Error("面试导演选项无效");
  }
  const jobPostingId = request.jobPostingId === undefined
    ? undefined : requiredText(request.jobPostingId, "岗位库岗位 ID", 100);

  return {
    title,
    candidateName: requiredText(request.candidateName, "候选人姓名", 100),
    positionTitle: jobPostingId ? "" : requiredText(request.positionTitle, "目标岗位", 120),
    jobDescription: jobPostingId ? "" : optionalText(request.jobDescription, "岗位描述", 200_000) ?? "",
    ...(jobPostingId ? { jobPostingId } : {}),
    resumeText: requiredText(request.resumeText, "简历内容", 500_000),
    questionCount: Number(request.questionCount),
    competencies,
    ...(request.algorithmEnabled === undefined ? {} : { algorithmEnabled: request.algorithmEnabled }),
    ...(request.directorEnabled === undefined ? {} : { directorEnabled: request.directorEnabled }),
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
  if (!Array.isArray(request.keywords) || request.keywords.length > 8) {
    throw new Error("最多输入 8 个搜索关键词");
  }
  const keywords = [...new Set(request.keywords.map((keyword) => requiredText(keyword, "搜索关键词", 50)))];
  if (keywords.length !== request.keywords.length) throw new Error("搜索关键词不能重复");
  if (!Number.isInteger(request.limitPerSource) || Number(request.limitPerSource) < 1 || Number(request.limitPerSource) > 500) {
    throw new Error("每个来源的采集上限必须在 1 到 500 之间");
  }
  return {
    sources: sources as JobSource[],
    keywords,
    limitPerSource: Number(request.limitPerSource),
  };
}

function parseDirectorConfig(value: unknown, interviewId: string, operationId: string): InterviewDirectorConfig {
  const record = strictRecord(value, "面试导演配置", ["enabled", "settings", "prompt"]);
  if (typeof record.enabled !== "boolean") throw new Error("面试导演启用状态无效");
  const settings = parseChatRequest({ interviewId, operationId, kind: "start", settings: record.settings }).settings;
  if (!settings) throw new Error("面试导演模型设置缺失");
  return { enabled: record.enabled, settings,
    prompt: requiredContentText(record.prompt, "面试导演提示词", 100_000) };
}

function parseChatRequest(value: unknown): InterviewChatRequest {
  const request = strictRecord(value, "面试对话参数", ["interviewId", "operationId", "kind", "content", "settings", "prompts", "director"]);
  const interviewId = identifier(request.interviewId, "面试 ID", 100);
  const operationId = identifier(request.operationId, "对话操作 ID", 128);
  if (request.kind !== "start" && request.kind !== "reply") throw new Error("对话类型无效");
  const content = request.kind === "reply" ? requiredText(request.content, "候选人回答", 8_000) : undefined;
  if (request.kind === "start" && request.content !== undefined) throw new Error("开始面试时不能附带回答");
  let settings: InterviewChatSettings | undefined;
  if (request.settings !== undefined) {
    const parsed = strictRecord(request.settings, "面试模型设置", ["model", "reasoning"]);
    if (!["default", "minimal", "low", "medium", "high", "xhigh", "max"].includes(String(parsed.reasoning))) {
      throw new Error("思考程度无效");
    }
    let model: InterviewChatSettings["model"];
    if (parsed.model !== undefined) {
      const selected = strictRecord(parsed.model, "面试模型", ["providerId", "modelId"]);
      model = {
        providerId: modelIdentifier(selected.providerId, "模型 Provider", 100),
        modelId: modelIdentifier(selected.modelId, "模型 ID", 160),
      };
    }
    settings = { ...(model ? { model } : {}), reasoning: parsed.reasoning as InterviewChatSettings["reasoning"] };
  }
  let prompts: InterviewChatPrompts | undefined;
  if (request.prompts !== undefined) {
    const parsed = strictRecord(request.prompts, "面试提示词", ["systemPrompt", "startInstruction", "replyInstruction"]);
    prompts = {
      systemPrompt: requiredContentText(parsed.systemPrompt, "基础系统提示词", 100_000),
      startInstruction: requiredContentText(parsed.startInstruction, "开场控制词", 20_000),
      replyInstruction: requiredContentText(parsed.replyInstruction, "续谈控制词", 20_000),
    };
  }
  const director = request.director === undefined ? undefined : parseDirectorConfig(request.director, interviewId, operationId);
  return { interviewId, operationId, kind: request.kind, ...(content ? { content } : {}),
    ...(settings ? { settings } : {}), ...(prompts ? { prompts } : {}), ...(director ? { director } : {}) };
}

function parseCandidateTurnRequest(value: unknown): CandidateTurnRequest {
  const input = strictRecord(value, "模拟候选人参数", ["interviewId", "operationId", "candidateSettings",
    "candidatePrompt", "candidateErrorRate", "interviewerSettings", "interviewerPrompts", "director"]);
  const interviewId = identifier(input.interviewId, "面试 ID", 100);
  const operationId = identifier(input.operationId, "模拟操作 ID", 128);
  const candidate = parseChatRequest({ interviewId, operationId, kind: "start", settings: input.candidateSettings });
  const interviewer = parseChatRequest({ interviewId, operationId, kind: "start",
    settings: input.interviewerSettings, prompts: input.interviewerPrompts, director: input.director });
  if (!candidate.settings || !interviewer.settings || !interviewer.prompts) throw new Error("模拟参数不完整");
  const candidateErrorRate = input.candidateErrorRate === undefined ? DEFAULT_CANDIDATE_ERROR_RATE : input.candidateErrorRate;
  if (!Number.isInteger(candidateErrorRate) || (candidateErrorRate as number) < 0 || (candidateErrorRate as number) > 100) {
    throw new Error("模拟误答概率必须为 0–100 的整数");
  }
  return { interviewId, operationId, candidateSettings: candidate.settings,
    candidatePrompt: requiredContentText(input.candidatePrompt, "模拟候选人提示词", 100_000),
    candidateErrorRate: candidateErrorRate as number,
    interviewerSettings: interviewer.settings, interviewerPrompts: interviewer.prompts,
    ...(interviewer.director ? { director: interviewer.director } : {}) };
}

function parseScoreRequest(value: unknown): InterviewScoreRequest {
  const input = strictRecord(value, "面试评分参数", ["interviewId", "operationId", "settings", "prompt"]);
  const interviewId = identifier(input.interviewId, "面试 ID", 100);
  const operationId = identifier(input.operationId, "评分操作 ID", 128);
  const settings = parseChatRequest({ interviewId, operationId, kind: "start", settings: input.settings }).settings;
  if (!settings) throw new Error("评分模型设置缺失");
  return { interviewId, operationId, settings,
    prompt: requiredContentText(input.prompt ?? DEFAULT_INTERVIEW_SCORE_PROMPT, "评分提示词", 100_000) };
}

function parseAlgorithmDraftRequest(value: unknown, submitting: false): InterviewAlgorithmDraftRequest;
function parseAlgorithmDraftRequest(value: unknown, submitting: true): InterviewAlgorithmSubmitRequest;
function parseAlgorithmDraftRequest(value: unknown, submitting: boolean): InterviewAlgorithmDraftRequest | InterviewAlgorithmSubmitRequest {
  const request = strictRecord(value, "算法考核请求",
    submitting ? ["interviewId", "operationId", "mode", "code"] : ["interviewId", "mode", "code"]);
  if (request.mode !== "leetcode" && request.mode !== "acm") throw new Error("算法考核模式无效");
  if (typeof request.code !== "string" || request.code.length > 200_000) throw new Error("算法代码格式无效或过长");
  const base: InterviewAlgorithmDraftRequest = {
    interviewId: identifier(request.interviewId, "面试 ID", 100),
    mode: request.mode as InterviewAlgorithmMode,
    code: request.code,
  };
  return submitting ? { ...base, operationId: identifier(request.operationId, "算法提交 ID", 128) } : base;
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
  private readonly activeChats = new Map<string, { task: Promise<unknown>; controller: AbortController }>();
  private readonly activeScores = new Map<string, { task: Promise<InterviewSession>; controller: AbortController }>();
  private readonly activeAlgorithmRuns = new Map<string, Promise<InterviewSession>>();
  private closeTask?: Promise<void>;
  private closing = false;
  private questionBankInitialization?: Promise<void>;
  readonly vectors: InterviewVectorStore;

  constructor(
    private readonly dataDirectory: string,
    vectorStore?: InterviewVectorStore,
    private readonly jobCollector?: InterviewJobCollector,
    private readonly questionBankResourceDirectory?: string,
    private readonly chatAgent?: InterviewChatAgent,
    private readonly algorithmExecutor?: InterviewAlgorithmExecutor,
    private readonly directorAgent?: InterviewDirectorAgent,
    private readonly scoreAgent?: InterviewScoreAgent,
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
    const database = this.getDatabase();
    if (!this.activeAlgorithmRuns.has(id)) database.expireAlgorithmExam(id);
    return database.getInterviewSession(id);
  }

  createInterview(value: unknown): InterviewRecord {
    const request = parseCreateRequest(value);
    if (request.algorithmEnabled && !this.algorithmExecutor) throw new Error("当前运行时未配置算法考核");
    const database = this.getDatabase();
    const job = request.jobPostingId ? database.getJobPosting(request.jobPostingId) : null;
    if (request.jobPostingId && !job) throw new Error("选择的岗位已不在岗位库中，请重新选择");
    const resolvedRequest = job ? { ...request, positionTitle: job.title, jobDescription: job.rawText } : request;
    return database.createInterview(resolvedRequest,
      request.algorithmEnabled ? this.algorithmExecutor!.pickProblem() : undefined);
  }

  async deleteInterview(value: unknown): Promise<InterviewSnapshot> {
    const id = identifier(value, "面试 ID", 100);
    if (this.closing) throw new Error("面试模块正在关闭，无法删除面试");
    if (this.activeChats.has(id) || this.activeScores.has(id)
      || this.activeAlgorithmRuns.has(id)) {
      throw new Error("这场面试仍有模型调用在进行，请等待结束后再删除");
    }
    const database = this.getDatabase();
    if (!database.getInterview(id)) throw new Error("面试不存在或已删除");
    // Vector rows are a regenerable cache; remove them before the durable record.
    await this.vectors.deleteByInterview(id);
    return database.deleteInterview(id);
  }

  finishInterview(value: unknown): InterviewSession {
    const id = identifier(value, "面试 ID", 100);
    if (this.closing) throw new Error("面试模块正在关闭，无法结束面试");
    if (this.activeChats.has(id) || this.activeAlgorithmRuns.has(id)) {
      throw new Error("这场面试仍有模型调用在进行，请等待结束后再操作");
    }
    return this.getDatabase().finishInterview(id);
  }

  scoreInterview(value: unknown): Promise<InterviewSession> {
    let request: InterviewScoreRequest;
    try { request = parseScoreRequest(value); } catch (error) { return Promise.reject(error); }
    if (this.closing) return Promise.reject(new Error("面试模块正在关闭，无法评分"));
    if (this.activeScores.has(request.interviewId) || this.activeChats.has(request.interviewId)) {
      return Promise.reject(new Error("本场面试正在处理，请稍后重试评分"));
    }
    const session = this.getDatabase().getInterviewSession(request.interviewId);
    if (!session || session.interview.status !== "completed") {
      return Promise.reject(new Error("请先结束面试，再生成评分"));
    }
    if (!session.turns.some((turn) => turn.role === "candidate")) {
      return Promise.reject(new Error("本场没有候选人回答，无法评分"));
    }
    const controller = new AbortController();
    const task = this.runScoreInterview(session, request, controller.signal);
    this.activeScores.set(request.interviewId, { task, controller });
    void task.finally(() => {
      if (this.activeScores.get(request.interviewId)?.task === task) this.activeScores.delete(request.interviewId);
    }).catch(() => undefined);
    return task;
  }

  private async runScoreInterview(session: InterviewSession, request: InterviewScoreRequest,
    signal: AbortSignal): Promise<InterviewSession> {
    const database = this.getDatabase();
    let trace: InterviewCallTrace | undefined;
    try {
      if (!this.scoreAgent) throw new Error("当前运行时未配置面试评分模型");
      const result = await this.scoreAgent.score(session, request.operationId, request.settings, request.prompt,
        signal, (value) => { trace = value; });
      signal.throwIfAborted();
      const coveredWeight = result.dimensions.reduce((sum, dimension) => sum + (dimension.score === null ? 0
        : INTERVIEW_SCORE_DIMENSIONS.find((entry) => entry.key === dimension.key)!.maxScore), 0);
      database.saveInterviewScoreReport({ interviewId: request.interviewId, status: "succeeded",
        dimensions: result.dimensions,
        total: coveredWeight === 100 ? result.dimensions.reduce((sum, dimension) => sum + (dimension.score ?? 0), 0) : null,
        coveredWeight, model: result.model, reasoning: request.settings.reasoning,
        prompt: request.prompt, rawOutput: result.rawOutput });
    } catch (error) {
      if (signal.aborted) throw error;
      database.saveInterviewScoreReport({ interviewId: request.interviewId, status: "failed",
        dimensions: [], total: null, coveredWeight: 0,
        model: request.settings.model ?? DEFAULT_INTERVIEW_CHAT_MODEL, reasoning: request.settings.reasoning,
        prompt: request.prompt, error: error instanceof Error ? error.message : String(error) });
    }
    if (trace) database.appendInterviewDebugTrace(request.interviewId, trace);
    return database.getInterviewSession(request.interviewId)!;
  }

  async startAlgorithmExam(value: unknown): Promise<InterviewSession> {
    const id = identifier(value, "面试 ID", 100);
    if (!this.algorithmExecutor) throw new Error("当前运行时未配置算法考核");
    const database = this.getDatabase();
    const session = database.startAlgorithmExam(id);
    if (session.algorithm?.status !== "active") return session;
    try {
      const runtime = await this.algorithmExecutor.getRuntimeInfo();
      if (!runtime.available) return database.markAlgorithmUnavailable(id);
    } catch {
      return database.markAlgorithmUnavailable(id);
    }
    database.expireAlgorithmExam(id);
    return database.getInterviewSession(id)!;
  }

  saveAlgorithmDraft(value: unknown): InterviewSession {
    const request = parseAlgorithmDraftRequest(value, false);
    const database = this.getDatabase();
    if (!this.activeAlgorithmRuns.has(request.interviewId)) database.expireAlgorithmExam(request.interviewId);
    return database.saveAlgorithmDraft(request.interviewId, request.mode, request.code);
  }

  submitAlgorithmCode(value: unknown): Promise<InterviewSession> {
    const request = parseAlgorithmDraftRequest(value, true);
    if (!this.algorithmExecutor) return Promise.reject(new Error("当前运行时未配置算法考核"));
    if (this.activeAlgorithmRuns.has(request.interviewId)) return Promise.reject(new Error("算法代码正在判题，请稍候"));
    const database = this.getDatabase();
    database.expireAlgorithmExam(request.interviewId);
    const exam = database.getAlgorithmExam(request.interviewId);
    const submittedAt = new Date().toISOString();
    if (!exam || exam.status !== "active" || !exam.deadlineAt || submittedAt >= exam.deadlineAt) {
      return Promise.reject(new Error("算法考核已结束，不能提交代码"));
    }
    const task = this.algorithmExecutor.run(exam.problem.slug, request.mode, request.code)
      .then((result) => {
        const session = database.recordAlgorithmAttempt({ ...request, ...result, submittedAt });
        if (result.verdict === "runtime_unavailable") database.markAlgorithmUnavailable(request.interviewId);
        else if (result.verdict !== "accepted") database.expireAlgorithmExam(request.interviewId);
        return database.getInterviewSession(request.interviewId) ?? session;
      });
    this.activeAlgorithmRuns.set(request.interviewId, task);
    void task.finally(() => {
      if (this.activeAlgorithmRuns.get(request.interviewId) === task) this.activeAlgorithmRuns.delete(request.interviewId);
    }).catch(() => undefined);
    return task;
  }

  sendChat(value: unknown): Promise<InterviewSession> {
    if (!this.chatAgent) return Promise.reject(new Error("当前运行时未配置面试对话模型"));
    if (this.closing) return Promise.reject(new Error("面试模块正在关闭"));
    let request: InterviewChatRequest;
    try { request = parseChatRequest(value); } catch (error) { return Promise.reject(error); }
    if (this.activeAlgorithmRuns.has(request.interviewId)) {
      return Promise.reject(new Error("算法代码正在判题，请等待结果后再开始面试"));
    }
    const active = this.activeChats.get(request.interviewId);
    if (active) return Promise.reject(new Error("模型正在回答，请等待本轮结束"));
    const controller = new AbortController();
    const task = this.runChat(request, controller.signal);
    this.activeChats.set(request.interviewId, { task, controller });
    void task.finally(() => {
      if (this.activeChats.get(request.interviewId)?.task === task) this.activeChats.delete(request.interviewId);
    }).catch(() => undefined);
    return task;
  }

  simulateCandidateTurn(value: unknown,
    onCandidateReady: (progress: CandidateTurnProgress) => void = () => undefined): Promise<CandidateTurnResult> {
    if (!this.chatAgent) return Promise.reject(new Error("当前运行时未配置面试对话模型"));
    if (this.closing) return Promise.reject(new Error("面试模块正在关闭"));
    let request: CandidateTurnRequest;
    try { request = parseCandidateTurnRequest(value); } catch (error) { return Promise.reject(error); }
    if (this.activeChats.has(request.interviewId) || this.activeAlgorithmRuns.has(request.interviewId)) {
      return Promise.reject(new Error("本场面试正在处理，请等待当前操作结束"));
    }
    const controller = new AbortController();
    const task = this.runCandidateTurn(request, controller.signal, onCandidateReady);
    this.activeChats.set(request.interviewId, { task, controller });
    void task.finally(() => {
      if (this.activeChats.get(request.interviewId)?.task === task) this.activeChats.delete(request.interviewId);
    }).catch(() => undefined);
    return task;
  }

  private async runCandidateTurn(request: CandidateTurnRequest, signal: AbortSignal,
    onCandidateReady: (progress: CandidateTurnProgress) => void): Promise<CandidateTurnResult> {
    const database = this.getDatabase();
    const session = database.getInterviewSession(request.interviewId);
    if (!session || session.interview.status !== "interviewing" || session.algorithm?.status === "active"
      || session.turns.at(-1)?.role !== "interviewer" || session.answeredCount >= MAX_INTERVIEW_ROUNDS) {
      throw new Error("请等待面试官提出问题后，再调用模拟候选人");
    }
    const questionTurnId = session.turns.at(-1)!.id;
    let decision = readCandidateResponseMode(session);
    if (!decision) {
      decision = chooseCandidateResponseMode(questionTurnId, request.candidateErrorRate ?? DEFAULT_CANDIDATE_ERROR_RATE);
      database.appendInterviewDebugTrace(request.interviewId, candidateResponseModeTrace(decision));
    }
    let candidateTrace: InterviewCallTrace | undefined;
    let candidateText: string;
    try {
      const generated = await this.chatAgent!.respondAsCandidate(session, `${request.operationId}:candidate`, {
        settings: request.candidateSettings, prompt: request.candidatePrompt,
        decision, signal,
        onTrace: (trace) => { candidateTrace = trace; },
      });
      candidateText = generated.text;
    } catch (error) {
      if (candidateTrace) database.appendInterviewDebugTrace(request.interviewId, candidateTrace);
      throw error;
    }
    signal.throwIfAborted();
    database.appendInterviewDebugTrace(request.interviewId, candidateTrace!);
    const candidateSession = database.appendCandidateTurn(request.interviewId,
      `${request.operationId}:answer`, candidateText, candidateTrace?.candidateOutcome);
    onCandidateReady({ interviewId: request.interviewId, operationId: request.operationId, session: candidateSession });
    try {
      const next = await this.runChat({ interviewId: request.interviewId,
        operationId: `${request.operationId}:interviewer`, kind: "reply", content: candidateText,
        settings: request.interviewerSettings, prompts: request.interviewerPrompts,
        director: request.director }, signal, "agent", candidateTrace?.candidateOutcome);
      return { session: next, candidateText, status: "completed" };
    } catch (error) {
      if (signal.aborted) throw error;
      return { session: database.getInterviewSession(request.interviewId)!, candidateText,
        status: "interviewer_failed", error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async runChat(request: InterviewChatRequest, signal: AbortSignal,
    candidateSource: "manual" | "agent" = "manual",
    candidateOutcome?: InterviewTurn["candidateOutcome"]): Promise<InterviewSession> {
    const database = this.getDatabase();
    database.expireAlgorithmExam(request.interviewId);
    const persistedSession = database.getInterviewSession(request.interviewId);
    if (!persistedSession) throw new Error("面试不存在");
    const pendingCandidate = request.kind === "reply" && persistedSession.turns.at(-1)?.role === "candidate"
      && persistedSession.turns.at(-1)?.source === "agent" ? persistedSession.turns.at(-1) : undefined;
    if (pendingCandidate && request.content !== pendingCandidate.content) {
      throw new Error("模拟回答已保存，请先重试面试官回复");
    }
    // Model agents receive the same pre-answer session as before the answer was saved.
    const session = pendingCandidate ? { ...persistedSession,
      turns: persistedSession.turns.slice(0, -1), answeredCount: persistedSession.answeredCount - 1 } : persistedSession;
    if (session.algorithm && (session.algorithm.status === "pending" || session.algorithm.status === "active")) {
      throw new Error("请先完成算法考核，再开始正式面试");
    }
    if (!session.interview.documents.some((document) => document.kind === "resume" && document.content.trim())) {
      throw new Error("面试缺少可用简历，无法开始对话");
    }
    if (session.interview.status !== "draft" && session.interview.status !== "ready" && session.interview.status !== "interviewing") {
      throw new Error("当前面试状态不能进行对话");
    }
    if (request.kind === "start" && session.turns.length > 0) throw new Error("面试已经开始");
    if (request.kind === "reply" && (session.turns.length === 0 || session.turns.at(-1)?.role !== "interviewer")) {
      throw new Error("请先开始面试，等待面试官提问");
    }
    if (request.kind === "reply" && session.answeredCount >= MAX_INTERVIEW_ROUNDS) {
      throw new Error(`本场面试已达到 ${MAX_INTERVIEW_ROUNDS} 轮上限`);
    }
    if (request.director?.enabled && !session.interview.directorEnabled) {
      throw new Error("本场面试创建时未启用面试导演，面试中不能切换");
    }
    const directorConfig = session.interview.directorEnabled ? request.director ?? {
      enabled: true, settings: DEFAULT_DIRECTOR_CHAT_SETTINGS, prompt: DEFAULT_INTERVIEW_DIRECTOR_PROMPT,
    } : undefined;
    const hardClose = request.kind === "reply" && session.answeredCount === MAX_INTERVIEW_ROUNDS - 1;
    const basePrompts = request.prompts ?? DEFAULT_INTERVIEW_CHAT_PROMPTS;
    const closingInstruction = "【本轮控制：程序硬上限】本轮是最后一轮。请自然感谢候选人并结束面试，不再提新问题；无需逐项复述已谈话题或评价候选人的不足。只输出对候选人说的话。";
    let trace: InterviewCallTrace | undefined;
    let response: Awaited<ReturnType<InterviewChatAgent["respond"]>>;
    try {
      response = await this.chatAgent!.respond(session, request.content, request.operationId,
        { settings: request.settings, prompts: request.prompts,
          ...(hardClose ? { additionalControl: closingInstruction } : {}),
          signal, onTrace: (value) => { trace = value; } });
    } catch (error) {
      if (trace) database.appendInterviewDebugFailure(request.interviewId, trace);
      if (hardClose && !signal.aborted) {
        return database.appendInterviewLimitEnding(request.interviewId, request.operationId,
          request.content!, candidateSource, closeInterviewTopicFlow(session.topicFlow, "20 轮硬上限"),
          candidateOutcome, Boolean(pendingCandidate));
      }
      throw error;
    }
    signal.throwIfAborted();
    let finalResponse = response;
    let complete = hardClose;
    let acceptedTopicReport: DirectorTopicReport | undefined;
    const debugTraces: InterviewCallTrace[] = [];
    const enforceTopicPolicy = (decision: InterviewDirectorDecision, directorTrace: InterviewCallTrace): InterviewDirectorDecision => {
      if (decision.action !== "pass") return decision;
      const issue = checkInterviewTopicPolicy(session.topicFlow, decision.flow, session.answeredCount);
      if (!issue) return decision;
      directorTrace.deliveryNote = [directorTrace.deliveryNote,
        `程序话题校验未放行：${issue.reason}。已要求面试官改写。`].filter(Boolean).join(" ");
      return { ...decision, action: "redirect", reason: issue.reason, guidance: issue.guidance };
    };
    if (request.kind === "reply" && !hardClose && directorConfig && this.directorAgent) {
      let directorTrace: InterviewCallTrace | undefined;
      try {
        const review = await this.directorAgent.review(session, request.content!, response.text,
          `${request.operationId}:director`, { settings: directorConfig.settings, prompt: directorConfig.prompt,
            signal, onTrace: (value) => { directorTrace = value; } });
        signal.throwIfAborted();
        const reviewedDecision = enforceTopicPolicy(review.decision, review.trace);
        if (reviewedDecision.action !== "pass") {
          debugTraces.push({ ...response.trace, operationId: `${request.operationId}:draft` });
        }
        debugTraces.push(review.trace);
        if (reviewedDecision.action !== "pass") {
          const rewrite = async (control: string, suffix: string) => {
            let rewriteTrace: InterviewCallTrace | undefined;
            try {
              return await this.chatAgent!.respond(session, request.content,
                `${request.operationId}:${suffix}`, { settings: request.settings,
                  prompts: basePrompts, additionalControl: control,
                  signal, onTrace: (value) => { rewriteTrace = value; } });
            } catch (error) {
              for (const item of debugTraces) database.appendInterviewDebugTrace(request.interviewId, item);
              if (rewriteTrace) database.appendInterviewDebugFailure(request.interviewId, rewriteTrace);
              throw error;
            }
          };
          const closeControl = (guidance: string) => `【面试导演控制：自然收尾】${guidance}\n请用简短、自然的口语感谢候选人并结束面试，不再提新问题；不必汇报覆盖情况或逐项评价候选人。只输出对候选人说的话。`;
          if (reviewedDecision.action === "close") {
            finalResponse = await rewrite(closeControl(reviewedDecision.guidance), "revision");
            acceptedTopicReport = reviewedDecision.flow;
            complete = true;
          } else {
            let guidance = reviewedDecision.guidance;
            let revisionAction: "correct" | "redirect" = reviewedDecision.action;
            let rejectedDraft = response.text;
            for (let revision = 1; revision <= 2; revision++) {
              const control = revisionAction === "correct"
                ? `【面试导演控制：修正纠错】${guidance}\n此前未发送的问题草稿：${rejectedDraft}\n请简短、尊重且准确地指出有充分依据的技术错误，然后留在同一技术点上提出一个应用或边界问题；不得纠错后立即切换到无关话题。不要让候选人复述标准答案；若事实不足，改为澄清条件。只输出对候选人说的话。`
                : `【面试导演控制：调整提问】${guidance}\n此前未发送的问题草稿：${rejectedDraft}\n按指导修正提问前提或调整方向。若仅需澄清实际经历与假设方案，留在当前话题确认，不强制换题；仅在要求换方向时停止原追问链，承接真实关联或简短点明另一段经历、岗位方向，不牵强类比。只提出一个清楚的问题，不解释内部话题安排。只输出对候选人说的话。`;
              const candidate = await rewrite(control, revision === 1 ? "revision" : "revision-2");
              let verificationTrace: InterviewCallTrace | undefined;
              let verification: Awaited<ReturnType<InterviewDirectorAgent["review"]>>;
              try {
                verification = await this.directorAgent.review(session, request.content!, candidate.text,
                  `${request.operationId}:director-verify-${revision}`, {
                    settings: directorConfig.settings,
                    prompt: `${directorConfig.prompt}\n【改写后复核】\n上一轮要求的改写动作是 ${revisionAction}，方向是：${guidance}\n审查草稿是否真正完成该动作。若是纠错，须准确、尊重地指出高确定性的错误，并在同一技术点上提出相关问题；纠错后跳到无关能力不能 pass。若仅要求修正事实前提，检查是否区分实际经历与方案，不要求换题。若要求换题，检查是否停止原追问链、范围是否清楚；可以承接真实关联，也可以简短点明另一段经历或岗位方向，不要求强行类比。已完成要求且无其他实质问题时选择 pass，不为同义改写再次拒绝；仍有问题时选择 correct 或 redirect，指出草稿尚存的具体缺陷和需要产生的实质变化。`,
                    signal, onTrace: (value) => { verificationTrace = value; },
                  });
              } catch (error) {
                debugTraces.push({ ...candidate.trace, operationId: `${request.operationId}:revision-${revision}:draft` });
                for (const item of debugTraces) database.appendInterviewDebugTrace(request.interviewId, item);
                if (verificationTrace) database.appendInterviewDebugFailure(request.interviewId, verificationTrace);
                throw error;
              }
              signal.throwIfAborted();
              const verifiedDecision = enforceTopicPolicy(verification.decision, verification.trace);
              if (verifiedDecision.action === "pass") {
                debugTraces.push(verification.trace);
                finalResponse = candidate;
                acceptedTopicReport = verifiedDecision.flow;
                break;
              }
              debugTraces.push({ ...candidate.trace, operationId: `${request.operationId}:revision-${revision}:draft` },
                verification.trace);
              if (verifiedDecision.action === "close") {
                finalResponse = await rewrite(closeControl(verifiedDecision.guidance), "revision-close");
                acceptedTopicReport = verifiedDecision.flow;
                complete = true;
                break;
              }
              guidance = verifiedDecision.guidance;
              revisionAction = verifiedDecision.action;
              rejectedDraft = candidate.text;
              if (revision === 2) {
                for (const item of debugTraces) database.appendInterviewDebugTrace(request.interviewId, item);
                throw new Error("面试官两次改写后仍未通过导演复核；本轮未发送，请检查调用记录后重试");
              }
            }
          }
        } else acceptedTopicReport = reviewedDecision.flow;
      } catch (error) {
        if (signal.aborted) throw error;
        if (directorTrace?.status === "failed") {
          database.appendInterviewDebugTrace(request.interviewId,
            { ...response.trace, operationId: `${request.operationId}:draft` });
          database.appendInterviewDebugFailure(request.interviewId, directorTrace);
        }
        throw error;
      }
    } else if (request.kind === "reply" && !hardClose && directorConfig) {
      const now = new Date().toISOString();
      database.appendInterviewDebugTrace(request.interviewId,
        { ...response.trace, operationId: `${request.operationId}:draft` });
      database.appendInterviewDebugFailure(request.interviewId, { actor: "director", operationId: `${request.operationId}:director`,
        status: "failed", startedAt: now, finishedAt: now,
        requestedModel: directorConfig.settings.model ?? DEFAULT_INTERVIEW_CHAT_MODEL,
        reasoning: directorConfig.settings.reasoning, timeoutMs: 0, messages: [], attempts: [],
        error: { code: "director_unavailable", message: "面试导演运行时不可用，本轮问题未发送。" } });
      throw new Error("面试导演运行时不可用，本轮问题未发送；请稍后重试");
    }
    signal.throwIfAborted();
    if (complete && (/[?？]/u.test(finalResponse.text) || !/感谢|谢谢|到这里|结束|再见/u.test(finalResponse.text))) {
      finalResponse = { ...finalResponse, text: "感谢你今天的分享，本次面试先到这里。", questionType: "other",
        trace: { ...finalResponse.trace,
          deliveryNote: "模型未给出明确收尾或继续提问；程序按结束决定改用固定告别语。模型原始输出保留在下方。" } };
    }
    const topicFlow = request.kind === "reply" && acceptedTopicReport
      ? advanceInterviewTopicFlow(session.topicFlow, acceptedTopicReport, session.answeredCount, complete)
      : hardClose ? closeInterviewTopicFlow(session.topicFlow, "20 轮硬上限") : undefined;
    return database.appendInterviewExchange({ interviewId: request.interviewId, operationId: request.operationId,
      ...(request.content && !pendingCandidate ? { candidateText: request.content, candidateSource,
        ...(candidateOutcome ? { candidateOutcome } : {}) } : {}), interviewerText: finalResponse.text,
      questionType: complete ? "other" : acceptedTopicReport?.draft.source ?? finalResponse.questionType,
      ...(acceptedTopicReport && !session.topicFlow?.questionSources?.some((item) => item.round === session.answeredCount + 1)
        ? { answeredQuestionType: acceptedTopicReport.answeredTopic.source } : {}),
      trace: finalResponse.trace, complete, debugTraces, ...(topicFlow ? { topicFlow } : {}) });
  }

  getJobLibrary(): JobLibrarySnapshot {
    return this.getDatabase().getJobLibrary();
  }

  async getQuestionBankSnapshot(): Promise<QuestionBankSnapshot> {
    await this.ensureQuestionBankReady();
    return this.getDatabase().getQuestionBankSnapshot();
  }

  async importKnowledgeStudioQuestions(payload: KnowledgeInterviewImportPayload): Promise<KnowledgeInterviewImportCounts> {
    await this.ensureQuestionBankReady();
    const result = this.getDatabase().importQuestionPackage(knowledgeStudioQuestionPackage(payload));
    return { inserted: result.inserted, updated: result.updated, unchanged: result.unchanged,
      alreadyImported: result.alreadyImported };
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
        if (output.error && output.jobs.length === 0) {
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
        results.push({ source: output.source, status: output.error ? "partial" : "completed",
          collected: output.jobs.length, ...changes, ...(output.error ? { error: output.error } : {}) });
      }
      const completed = results.filter((result) => result.status === "completed").length;
      const retained = results.filter((result) => result.status !== "failed").length;
      const status = completed === results.length ? "completed" : retained > 0 ? "partial" : "failed";
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

  private async closeResources(): Promise<void> {
    this.closing = true;
    this.activeCollectionAbort?.abort(new Error("客户端正在退出，岗位采集已取消"));
    for (const chat of this.activeChats.values()) chat.controller.abort(new Error("客户端正在退出，面试对话已取消"));
    for (const score of this.activeScores.values()) score.controller.abort(new Error("客户端正在退出，面试评分已取消"));
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
    await Promise.allSettled([...this.activeChats.values()].map((chat) => chat.task));
    await Promise.allSettled([...this.activeScores.values()].map((score) => score.task));
    await Promise.allSettled([...this.activeAlgorithmRuns.values()]);
    if (this.questionBankInitialization) await Promise.allSettled([this.questionBankInitialization]);
    try {
      await this.vectors.close();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.algorithmExecutor?.close();
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
