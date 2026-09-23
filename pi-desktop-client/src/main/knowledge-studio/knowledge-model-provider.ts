import { createHash, randomUUID } from "node:crypto";
import type { AiUsage } from "../../platform/shared/ai/contracts";
import { type ModelGateway, type ModelRequest, type ModelResponse } from "../../platform/shared/ai/model-gateway";
import { estimateJsonRequestTokens, estimateTextTokens } from "../../platform/shared/ai/token-estimate";
import {
  DEFAULT_KNOWLEDGE_AI_SETTINGS,
  KNOWLEDGE_QUESTION_DIFFICULTIES,
  KNOWLEDGE_QUESTION_KINDS,
  KNOWLEDGE_STUDIO_PROMPT_VERSION,
  knowledgeSystemPrompt,
  type KnowledgeGenerationAiSettings,
  type KnowledgeEvidence,
  type KnowledgeGenerationEvent,
  type KnowledgeWindowPreview,
  type KnowledgeQuestionCandidate,
  type KnowledgeQuestionDifficulty,
  type KnowledgeQuestionKind,
  type KnowledgeRubricItem,
  type KnowledgeValidationStatus,
} from "../../shared/contracts/knowledge-studio";
import type { StoredCandidate } from "./knowledge-studio-database";

const ANSWER_BATCH_SIZE = 5;
const REVIEW_CALL_BATCH_SIZE = 10;
const MAX_NETWORK_RETRIES = 5;
const MAX_NETWORK_ATTEMPTS = MAX_NETWORK_RETRIES + 1;
const MAX_ANSWER_QUALITY_ATTEMPTS = 3;
const MAX_ANSWER_CHARACTERS = 300;

export type KnowledgeModelSegment = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  heading?: string;
  content: string;
};

export type KnowledgeWorkflowInput = {
  batchId: string;
  title: string;
  targetRole: string;
  difficulty: KnowledgeQuestionDifficulty | "mixed";
  questionCount: number;
  segments: KnowledgeModelSegment[];
  aiSettings?: KnowledgeGenerationAiSettings;
  previousEvents?: KnowledgeGenerationEvent[];
};

export type KnowledgeWorkflowProgressDetail = {
  state: "running" | "completed" | "failed";
  providerId?: string;
  modelId?: string;
  usage?: AiUsage;
  details?: KnowledgeGenerationEvent["details"];
};

export type KnowledgeWorkflowProgress = (
  stage: "extracting" | "answering" | "validating",
  progress: number,
  message: string,
  detail: KnowledgeWorkflowProgressDetail,
) => void;

export type KnowledgeWorkflowResult = {
  candidates: StoredCandidate[];
  providerId: string;
  modelId: string;
  usage: AiUsage;
  requestHash: string;
};

type DraftQuestion = {
  ordinal: number;
  competency: string;
  kind: KnowledgeQuestionKind;
  difficulty: KnowledgeQuestionDifficulty;
  question: string;
  evidenceSegmentIds: string[];
};

type CompletedQuestion = DraftQuestion & {
  answer: string;
  rubric: KnowledgeRubricItem[];
  pitfalls: string[];
  followUps: string[];
  evidence: Array<{ segmentId: string; quote: string }>;
};

type Review = {
  ordinal: number;
  verdict: KnowledgeValidationStatus;
  notes: string[];
};

type WindowSegment = KnowledgeModelSegment & { startOffset: number; endOffset: number };
type DraftWindow = { index: number; segments: WindowSegment[]; estimatedInputTokens: number; hash: string };
type WindowPlan = { preview: KnowledgeWindowPreview; windows: DraftWindow[] };

function balancedQuestionQuotas(questionCount: number, windowCount: number): number[] {
  if (windowCount === 0) return [];
  const quotas = Array.from({ length: windowCount }, () => 1);
  for (let extra = Math.max(0, questionCount - windowCount), index = 0; extra > 0; extra -= 1, index += 1) {
    quotas[index % windowCount]! += 1;
  }
  return quotas;
}

function draftContext(segments: readonly KnowledgeModelSegment[]) {
  return segments.map((segment) => ({
    segmentId: segment.id, sourceTitle: segment.sourceTitle, heading: segment.heading, content: segment.content,
  }));
}

function fullInputBudget(settings: KnowledgeGenerationAiSettings): { capacity: number; budget: number } {
  const capacity = settings.modelContextWindowTokens;
  if (!capacity || !Number.isFinite(capacity)) throw new Error("所选模型的上下文容量未知，无法安全规划资料窗口。请刷新模型列表或选择提供容量信息的模型");
  const reasoningReserve = ["high", "xhigh", "max"].includes(settings.thinkingLevel ?? "") ? 24_000 : 8_000;
  const reserve = Math.max(Math.ceil(capacity * 0.30), (settings.modelMaxOutputTokens ?? 0) + reasoningReserve);
  const budget = Math.min(Math.floor(0.70 * Math.min(capacity, 258_000)), capacity - reserve);
  if (budget < 1_000) throw new Error("模型上下文容量不足以同时容纳提示词、输出与推理预留");
  return { capacity, budget };
}

function preferredSplit(content: string, maximum: number): number {
  const floor = Math.floor(maximum * 0.8);
  for (let index = maximum; index >= floor; index -= 1) {
    if (content[index - 1] === "\n" || /[。！？.!?；;]/u.test(content[index - 1] ?? "")) return index;
  }
  if (maximum < content.length && /[\uD800-\uDBFF]/u.test(content[maximum - 1] ?? "")
    && /[\uDC00-\uDFFF]/u.test(content[maximum] ?? "")) return maximum - 1;
  return maximum;
}

function planDraftWindows(input: KnowledgeWorkflowInput, budgetOverride?: number): WindowPlan {
  const settings = input.aiSettings ?? DEFAULT_KNOWLEDGE_AI_SETTINGS;
  const { capacity, budget: defaultBudget } = fullInputBudget(settings);
  const budget = Math.min(defaultBudget, budgetOverride ?? defaultBudget);
  const planningReserveTokens = Math.min(2_048, Math.floor(budget * 0.03));
  const packingBudget = budget - planningReserveTokens;
  const system = knowledgeSystemPrompt("drafts", settings.stages.drafts.additionalSystemInstruction);
  const count = Math.max(1, input.questionCount);
  const schema = requestSchema("drafts", count);
  const schemaName = "knowledge_studio_drafts_v1";
  const avoidQuestionsBudget = Array.from({ length: 12 }, () => "中".repeat(120));
  const estimate = (segments: readonly KnowledgeModelSegment[]) => estimateJsonRequestTokens(system, {
    targetRole: input.targetRole, difficulty: input.difficulty, questionCount: count,
    avoidQuestions: avoidQuestionsBudget, sources: draftContext(segments),
  }, schemaName, schema);
  const baseOverhead = estimate([]);
  if (baseOverhead >= packingBudget) throw new Error(`问题规划提示词及 Schema 预计占用 ${baseOverhead} tokens，已超过可打包预算 ${packingBudget}`);
  const windows: DraftWindow[] = [];
  let pending: WindowSegment[] = [];
  const flush = () => {
    if (!pending.length) return;
    const index = windows.length + 1;
    const estimatedInputTokens = estimate(pending);
    if (estimatedInputTokens > packingBudget) throw new Error(`第 ${index} 个资料窗口超过完整输入预算`);
    const hash = createHash("sha256").update(JSON.stringify({
      model: settings.model, capacity, promptVersion: KNOWLEDGE_STUDIO_PROMPT_VERSION,
      instruction: settings.stages.drafts.additionalSystemInstruction,
      targetRole: input.targetRole, difficulty: input.difficulty,
      segments: pending.map((segment) => [segment.id, segment.startOffset, segment.endOffset, segment.content]),
    })).digest("hex");
    windows.push({ index, segments: pending, estimatedInputTokens, hash });
    pending = [];
  };
  for (const source of input.segments) {
    if (!source.content) continue;
    const baseOffset = "startOffset" in source && typeof source.startOffset === "number" ? source.startOffset : 0;
    let offset = 0;
    while (offset < source.content.length) {
      const remaining = source.content.slice(offset);
      const whole: WindowSegment = { ...source, content: remaining, startOffset: baseOffset + offset, endOffset: baseOffset + source.content.length };
      if (estimate([...pending, whole]) <= packingBudget) { pending.push(whole); break; }
      if (pending.length) { flush(); continue; }
      let low = 1;
      let high = remaining.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        const candidate: WindowSegment = { ...whole, content: remaining.slice(0, middle), endOffset: baseOffset + offset + middle };
        if (estimate([candidate]) <= packingBudget) low = middle;
        else high = middle - 1;
      }
      const largest: WindowSegment = { ...whole, content: remaining.slice(0, low), endOffset: baseOffset + offset + low };
      if (low < 1 || estimate([largest]) > packingBudget) {
        throw new Error(`片段 ${source.id} 连一个字符也无法装入模型输入预算`);
      }
      const split = preferredSplit(remaining, low);
      if (split < 1) throw new Error(`片段 ${source.id} 的 Unicode 字符无法装入模型输入预算`);
      const fragment = { ...whole, content: remaining.slice(0, split), endOffset: baseOffset + offset + split };
      pending.push(fragment);
      flush();
      offset += split;
    }
  }
  flush();
  if (!windows.length) throw new Error("所选资料没有可用于生成的正文片段");
  // Preserve the minimum greedy window count, but move whole boundary fragments when
  // that makes adjacent windows more balanced. Never introduce a new window here.
  for (let index = windows.length - 2; index >= 0; index -= 1) {
    const left = windows[index]!;
    const right = windows[index + 1]!;
    while (left.segments.length > 1) {
      const boundary = left.segments.at(-1)!;
      const leftAfter = estimate(left.segments.slice(0, -1));
      const rightAfter = estimate([boundary, ...right.segments]);
      if (rightAfter > packingBudget || Math.abs(leftAfter - rightAfter) >= Math.abs(left.estimatedInputTokens - right.estimatedInputTokens)) break;
      left.segments.pop();
      right.segments.unshift(boundary);
      left.estimatedInputTokens = leftAfter;
      right.estimatedInputTokens = rightAfter;
    }
  }
  for (const window of windows) {
    window.hash = createHash("sha256").update(JSON.stringify({
      model: settings.model, capacity, promptVersion: KNOWLEDGE_STUDIO_PROMPT_VERSION,
      instruction: settings.stages.drafts.additionalSystemInstruction,
      targetRole: input.targetRole, difficulty: input.difficulty,
      segments: window.segments.map((segment) => [segment.id, segment.startOffset, segment.endOffset, segment.content]),
    })).digest("hex");
  }
  const covered = new Set(windows.flatMap((window) => window.segments.map((segment) => segment.id)));
  const available = new Set(input.segments.filter((segment) => segment.content).map((segment) => segment.id));
  if (covered.size !== available.size || [...available].some((id) => !covered.has(id))) throw new Error("分窗覆盖检查失败：存在未纳入的资料片段");
  const expectedContent = new Map<string, string>();
  const includedContent = new Map<string, string>();
  for (const segment of input.segments) expectedContent.set(segment.id, (expectedContent.get(segment.id) ?? "") + segment.content);
  for (const window of windows) for (const segment of window.segments) {
    includedContent.set(segment.id, (includedContent.get(segment.id) ?? "") + segment.content);
  }
  for (const [id, content] of expectedContent) {
    if (includedContent.get(id) !== content) throw new Error(`分窗覆盖检查失败：片段 ${id} 有正文缺失或顺序错误`);
  }
  const overhead = Math.max(baseOverhead, ...windows.map((window) => window.estimatedInputTokens
    - window.segments.reduce((sum, segment) => sum + estimateTextTokens(segment.content), 0)));
  const plannedQuestions = balancedQuestionQuotas(input.questionCount, windows.length);
  return { windows, preview: {
    modelContextWindowTokens: capacity, modelCapacitySource: "runtime", fullInputBudgetTokens: defaultBudget,
    packingTargetTokens: budget,
    requestOverheadTokens: overhead, planningReserveTokens, sourceBudgetTokens: packingBudget - overhead,
    totalSourceTokens: input.segments.reduce((sum, segment) => sum + estimateTextTokens(segment.content), 0),
    selectedSources: new Set(input.segments.map((segment) => segment.sourceId)).size,
    availableSegments: available.size, coveredSegments: covered.size, windowCount: windows.length,
    windows: windows.map((window, index) => ({ index: window.index,
      plannedQuestions: plannedQuestions[index]!, segmentCount: window.segments.length,
      sourceCount: new Set(window.segments.map((segment) => segment.sourceId)).size,
      estimatedInputTokens: window.estimatedInputTokens,
      sourceTokens: window.segments.reduce((sum, segment) => sum + estimateTextTokens(segment.content), 0),
      characters: window.segments.reduce((sum, segment) => sum + segment.content.length, 0),
      firstSegmentId: window.segments[0]!.id, lastSegmentId: window.segments.at(-1)!.id,
      firstStartOffset: window.segments[0]!.startOffset, lastEndOffset: window.segments.at(-1)!.endOffset,
    })),
  } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clippedText(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function stringArray(value: unknown, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => clippedText(entry, maximumLength)).filter(Boolean).slice(0, maximumItems);
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("模型没有返回有效 JSON");
  }
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  return values.includes(value as T[number]) ? value as T[number] : fallback;
}

function parseDrafts(text: string, expectedCount: number, validSegments: Set<string>): DraftQuestion[] {
  const payload = parseJson(text);
  const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
  const drafts = items.slice(0, expectedCount).map((entry, index) => {
    if (!isRecord(entry)) throw new Error("题目规划结果结构无效");
    const question = clippedText(entry.question, 1_200);
    const competency = clippedText(entry.competency, 120);
    if (!question || !competency) throw new Error("题目规划缺少问题或能力维度");
    return {
      ordinal: index,
      competency,
      kind: enumValue(entry.kind, KNOWLEDGE_QUESTION_KINDS, "technical"),
      difficulty: enumValue(entry.difficulty, KNOWLEDGE_QUESTION_DIFFICULTIES, "intermediate"),
      question,
      evidenceSegmentIds: stringArray(entry.evidenceSegmentIds, 8, 160).filter((id) => validSegments.has(id)),
    };
  });
  if (drafts.length !== expectedCount) throw new Error(`模型只生成了 ${drafts.length}/${expectedCount} 道候选题`);
  return drafts;
}

function normalizeRubric(value: unknown): { items: KnowledgeRubricItem[]; adjusted: boolean } {
  if (!Array.isArray(value)) return { items: [], adjusted: false };
  const items = value.slice(0, 8).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const title = clippedText(entry.title, 100);
    const description = clippedText(entry.description, 500);
    const weight = Math.max(0, Math.round(Number(entry.weight)));
    return title && description && Number.isFinite(weight) ? [{ title, description, weight }] : [];
  });
  if (items.length === 0) return { items, adjusted: false };
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (total === 100) return { items, adjusted: false };
  if (total <= 0) {
    const base = Math.floor(100 / items.length);
    return {
      items: items.map((item, index) => ({ ...item, weight: base + (index < 100 - base * items.length ? 1 : 0) })),
      adjusted: true,
    };
  }
  let assigned = 0;
  const normalized = items.map((item, index) => {
    const weight = index === items.length - 1 ? 100 - assigned : Math.round(item.weight / total * 100);
    assigned += weight;
    return { ...item, weight };
  });
  return { items: normalized, adjusted: true };
}

function parseCompleted(text: string, drafts: DraftQuestion[], validSegments: Set<string>): Array<CompletedQuestion & { adjustedRubric: boolean }> {
  const payload = parseJson(text);
  const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
  if (items.length !== drafts.length) throw new Error("答案生成数量与题目数量不一致");
  const byOrdinal = new Map<number, Record<string, unknown>>();
  for (const entry of items) {
    if (!isRecord(entry) || !Number.isInteger(entry.ordinal) || Number(entry.ordinal) < 0
      || Number(entry.ordinal) >= drafts.length || byOrdinal.has(Number(entry.ordinal))) {
      throw new Error("答案生成的题号缺失、重复或越界");
    }
    byOrdinal.set(Number(entry.ordinal), entry);
  }
  return drafts.map((draft, index) => {
    const entry = byOrdinal.get(index);
    if (!isRecord(entry)) throw new Error("答案生成结果结构无效");
    const answer = clippedText(entry.answer, 8_000);
    const rubric = normalizeRubric(entry.rubric);
    if (!answer || rubric.items.length === 0) throw new Error(`第 ${index + 1} 题缺少答案或评分标准`);
    const evidence = Array.isArray(entry.evidence) ? entry.evidence.slice(0, 10).flatMap((item) => {
      if (!isRecord(item)) return [];
      const segmentId = clippedText(item.segmentId, 160);
      const quote = clippedText(item.quote, 900);
      return segmentId && quote && validSegments.has(segmentId) ? [{ segmentId, quote }] : [];
    }) : [];
    return {
      ...draft,
      answer,
      rubric: rubric.items,
      adjustedRubric: rubric.adjusted,
      pitfalls: stringArray(entry.pitfalls, 6, 500),
      followUps: stringArray(entry.followUps, 6, 500),
      evidence,
    };
  });
}

function answerQualityIssues(answer: string): string[] {
  const issues: string[] = [];
  const length = Array.from(answer).length;
  if (length > MAX_ANSWER_CHARACTERS) issues.push(`参考答案有 ${length} 个字符，超过 ${MAX_ANSWER_CHARACTERS} 字上限`);
  if (/(?:\*\*|__|`)/u.test(answer) || /^[ \t]*#{1,6}(?:[ \t]|$)/mu.test(answer)) {
    issues.push("参考答案包含 Markdown 格式");
  }
  if (/^[ \t]*(?:[-*+][ \t]+|(?:\d{1,2}[.、)．](?!\d)|[一二三四五六七八九十]+[、.．]))/mu.test(answer)) {
    issues.push("参考答案包含编号或项目符号，应改为自然口语段落");
  }
  if (answer.split(/\r?\n/u).filter((line) => line.trim()).length > 2) {
    issues.push("参考答案分成过多行，应控制在一到两个自然段");
  }
  return issues;
}

function parseReviews(text: string, count: number): Review[] {
  const payload = parseJson(text);
  const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
  const byOrdinal = new Map<number, Review>();
  for (const entry of items) {
    if (!isRecord(entry)) continue;
    const ordinal = Number(entry.ordinal);
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= count) continue;
    byOrdinal.set(ordinal, {
      ordinal,
      verdict: enumValue(entry.verdict, ["supported", "needs_review", "rejected"] as const, "needs_review"),
      notes: stringArray(entry.notes, 8, 500),
    });
  }
  return Array.from({ length: count }, (_, ordinal) => byOrdinal.get(ordinal) ?? ({
    ordinal, verdict: "needs_review" as const, notes: ["独立校验未返回该题结果"],
  }));
}

function usageSum(values: AiUsage[]): AiUsage {
  const result: AiUsage = {};
  for (const key of ["inputTokens", "outputTokens", "totalTokens", "cachedInputTokens", "reasoningTokens", "costUsd", "durationMs"] as const) {
    const entries = values.map((value) => value[key]).filter((value): value is number => typeof value === "number");
    if (entries.length > 0) result[key] = entries.reduce((sum, value) => sum + value, 0);
  }
  return result;
}

function batches<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function isTransientNetworkError(error: unknown): error is KnowledgeModelError {
  return error instanceof KnowledgeModelError && error.retryable
    && ["timeout", "provider_unavailable", "rate_limited"].includes(error.code ?? "");
}

async function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason ?? new Error("任务已取消"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function requestSchema(stage: "drafts" | "answers" | "review", count: number): Readonly<Record<string, unknown>> {
  const base = { type: "object", additionalProperties: false, required: ["items"] } as const;
  if (stage === "review") return {
    ...base,
    properties: { items: { type: "array", minItems: count, maxItems: count, items: {
      type: "object", additionalProperties: false, required: ["ordinal", "verdict", "notes"],
      properties: {
        ordinal: { type: "integer", minimum: 0, maximum: count - 1 },
        verdict: { type: "string", enum: ["supported", "needs_review", "rejected"] },
        notes: { type: "array", items: { type: "string" }, maxItems: 8 },
      },
    } } },
  };
  const common = {
    ordinal: { type: "integer", minimum: 0, maximum: count - 1 },
    competency: { type: "string" }, kind: { type: "string", enum: KNOWLEDGE_QUESTION_KINDS },
    difficulty: { type: "string", enum: KNOWLEDGE_QUESTION_DIFFICULTIES }, question: { type: "string" },
    evidenceSegmentIds: { type: "array", items: { type: "string" } },
  };
  if (stage === "drafts") return {
    ...base, properties: { items: { type: "array", minItems: count, maxItems: count, items: {
      type: "object", additionalProperties: false,
      required: ["ordinal", "competency", "kind", "difficulty", "question", "evidenceSegmentIds"],
      properties: common,
    } } },
  };
  return {
    ...base, properties: { items: { type: "array", minItems: count, maxItems: count, items: {
      type: "object", additionalProperties: false,
      required: ["ordinal", "answer", "rubric", "pitfalls", "followUps", "evidence"],
      properties: {
        ordinal: common.ordinal, answer: { type: "string" },
        rubric: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", additionalProperties: false,
          required: ["title", "description", "weight"], properties: {
            title: { type: "string" }, description: { type: "string" }, weight: { type: "integer", minimum: 0, maximum: 100 },
          } } },
        pitfalls: { type: "array", maxItems: 6, items: { type: "string" } },
        followUps: { type: "array", maxItems: 6, items: { type: "string" } },
        evidence: { type: "array", minItems: 1, maxItems: 10, items: { type: "object", additionalProperties: false,
          required: ["segmentId", "quote"], properties: { segmentId: { type: "string" }, quote: { type: "string" } } } },
      },
    } } },
  };
}

export class KnowledgeModelError extends Error {
  constructor(message: string, readonly retryable = false, readonly code?: string, readonly statusCode?: number, readonly diagnosticCode?: string, readonly validationIssues?: string[]) {
    super(message);
  }
}

export class KnowledgeGenerationWorkflow {
  constructor(private readonly gateway: ModelGateway) {}

  plan(input: KnowledgeWorkflowInput): KnowledgeWindowPreview {
    return planDraftWindows(input).preview;
  }

  private async resolvedSettings(settings: KnowledgeGenerationAiSettings): Promise<KnowledgeGenerationAiSettings> {
    if (settings.modelContextWindowTokens) return settings;
    const models = await this.gateway.getAvailableModels?.() ?? [];
    const route = settings.model ?? await this.gateway.getConfiguredModel?.();
    const model = models.find((item) => item.providerId === route?.providerId && item.modelId === route?.modelId);
    if (!model?.contextWindowTokens) throw new Error("所选模型的上下文容量未知，无法安全规划资料窗口");
    return { ...settings, model: { providerId: model.providerId, modelId: model.modelId },
      modelContextWindowTokens: model.contextWindowTokens, modelMaxOutputTokens: model.maxOutputTokens };
  }

  async generate(input: KnowledgeWorkflowInput, signal: AbortSignal, onProgress: KnowledgeWorkflowProgress): Promise<KnowledgeWorkflowResult> {
    const aiSettings = await this.resolvedSettings(input.aiSettings ?? DEFAULT_KNOWLEDGE_AI_SETTINGS);
    const plan = planDraftWindows({ ...input, aiSettings });
    const context = draftContext(input.segments);
    const validSegments = new Set(input.segments.map((segment) => segment.id));
    const responses: ModelResponse[] = [];
    const draftContexts = new Map<DraftQuestion, ReturnType<typeof draftContext>>();

    onProgress("extracting", 12, `已规划 ${plan.preview.windowCount} 个资料窗口，覆盖 ${plan.preview.coveredSegments}/${plan.preview.availableSegments} 个片段；完整输入预算 ${plan.preview.fullInputBudgetTokens.toLocaleString()} tokens`, {
      state: "running", details: { kind: "window-plan", windowPlan: plan.preview },
    });
    const counts = balancedQuestionQuotas(input.questionCount, plan.windows.length);
    const perWindow: DraftQuestion[][] = plan.windows.map(() => []);
    const draftWindows = new Map<DraftQuestion, number>();
    onProgress("extracting", 14, `均衡分配局部候选：${counts.map((count, index) => `窗口 ${index + 1} ${count} 道`).join(" · ")}；每窗先一次性规划所分配题数`, { state: "running" });
    const processWindow = async (window: DraftWindow, count: number, index: number, label: string, batchKey = "", depth = 0): Promise<void> => {
      signal.throwIfAborted();
      const avoidQuestions = perWindow.flat().slice(-12).map((draft) => draft.question.slice(0, 120));
      const windowHash = createHash("sha256").update(JSON.stringify({ windowHash: window.hash, batchKey, count, avoidQuestions })).digest("hex");
      const windowContext = draftContext(window.segments);
      let draftsResponse: ModelResponse | undefined;
      for (const event of [...(input.previousEvents ?? [])].reverse()) {
        if (event.details?.kind !== "model-call" || event.details.phase !== "response"
          || event.details.purpose !== "drafts" || event.details.windowHash !== windowHash || !event.details.responseText) continue;
        const model = { providerId: event.providerId ?? "", modelId: event.modelId ?? "" };
        if (!model.providerId || !model.modelId) continue;
        try {
          parseDrafts(event.details.responseText, count, new Set(window.segments.map((segment) => segment.id)));
          draftsResponse = { requestId: event.details.requestId ?? "checkpoint", model, text: event.details.responseText,
            finishReason: "stop", usage: event.usage ?? {} };
          onProgress("extracting", 18, `窗口 ${label} 复用已完成的问题规划，不再调用模型`, {
            state: "completed", details: { kind: "window-plan", windowIndex: index + 1, windowCount: plan.windows.length, windowHash, windowLabel: label },
          });
          break;
        } catch { /* A response that did not pass local parsing is not a checkpoint. */ }
      }
      if (!draftsResponse) {
        const priorSplit = [...(input.previousEvents ?? [])].reverse().find((event) => event.details?.kind === "window-plan"
          && event.details.windowHash === windowHash && event.details.windowPlan
          && event.details.windowPlan.packingTargetTokens < plan.preview.fullInputBudgetTokens);
        if (priorSplit?.details?.windowPlan && depth < 3) {
          const smaller = planDraftWindows({ ...input, aiSettings, questionCount: count, segments: window.segments },
            priorSplit.details.windowPlan.packingTargetTokens);
          if (smaller.windows.length > 1) {
            onProgress("extracting", 18, `窗口 ${label} 沿用上次记录的缩小方案，不重试原超限窗口`, {
              state: "running", details: { kind: "window-plan", windowIndex: index + 1, windowCount: plan.windows.length,
                windowHash, windowLabel: label, windowPlan: smaller.preview },
            });
            const childCounts = smaller.windows.map(() => 1);
            for (let extra = Math.max(0, count - childCounts.length), cursor = 0; extra > 0; extra -= 1, cursor += 1) {
              childCounts[cursor % childCounts.length]! += 1;
            }
            for (const [childIndex, child] of smaller.windows.entries()) {
              await processWindow(child, childCounts[childIndex]!, index, `${label}.${childIndex + 1}`, batchKey, depth + 1);
            }
            return;
          }
        }
      }
      for (let attempt = 1; !draftsResponse; attempt += 1) {
        try {
          draftsResponse = await this.call({
            stage: "drafts", count, signal, onProgress, progress: 18 + Math.round(15 * index / plan.windows.length),
            system: knowledgeSystemPrompt("drafts", aiSettings.stages.drafts.additionalSystemInstruction), aiSettings,
            payload: { targetRole: input.targetRole, difficulty: input.difficulty, questionCount: count,
              avoidQuestions, sources: windowContext },
            window: { index: index + 1, count: plan.windows.length, hash: windowHash, label },
          });
        } catch (error) {
          const modelError = error instanceof KnowledgeModelError ? error : undefined;
          if (!signal.aborted && count > 1 && modelError?.code === "invalid_provider_response") {
            const firstCount = Math.floor(count / 2);
            onProgress("extracting", 18, `窗口 ${label} 输出未通过结构校验；将本批 ${count} 道拆为 ${firstCount} 和 ${count - firstCount} 道`, { state: "running" });
            await processWindow(window, firstCount, index, `${label}.1`, `${batchKey}:output-1`, depth);
            await processWindow(window, count - firstCount, index, `${label}.2`, `${batchKey}:output-2`, depth);
            return;
          }
          const contextError = modelError && (["budget_exceeded"].includes(modelError.code ?? "")
            || modelError.diagnosticCode === "CONTEXT_LIMIT"
            || (modelError.code === "invalid_request" && /context|token|length|too large|上下文|过长/iu.test(modelError.message)));
          const timeout = modelError?.code === "timeout";
          if (!signal.aborted && depth < 3 && (contextError || (timeout && attempt >= MAX_NETWORK_ATTEMPTS))) {
            const reducedBudget = Math.floor(Math.min(plan.preview.fullInputBudgetTokens * 0.85 ** (depth + 1), window.estimatedInputTokens * 0.8));
            const smaller = planDraftWindows({ ...input, aiSettings, questionCount: count, segments: window.segments }, reducedBudget);
            if (smaller.windows.length > 1) {
              onProgress("extracting", 18, `窗口 ${label} ${contextError ? "超过上下文限制" : "连续超时"}；仅将该窗口缩小为 ${smaller.windows.length} 个子窗口，已完成窗口不重跑`, {
                state: "running", details: { kind: "window-plan", windowIndex: index + 1, windowCount: plan.windows.length,
                  windowHash, windowLabel: label, windowPlan: smaller.preview },
              });
              const childCounts = smaller.windows.map(() => 1);
              for (let extra = Math.max(0, count - childCounts.length), cursor = 0; extra > 0; extra -= 1, cursor += 1) {
                childCounts[cursor % childCounts.length]! += 1;
              }
              for (const [childIndex, child] of smaller.windows.entries()) {
                await processWindow(child, childCounts[childIndex]!, index, `${label}.${childIndex + 1}`, batchKey, depth + 1);
              }
              return;
            }
          }
          if (!isTransientNetworkError(error) || signal.aborted || attempt >= MAX_NETWORK_ATTEMPTS) throw error;
          onProgress("extracting", 18, `窗口 ${label} 请求暂时失败，准备第 ${attempt + 1}/${MAX_NETWORK_ATTEMPTS} 次尝试（最多重试 ${MAX_NETWORK_RETRIES} 次）`, { state: "running" });
          await abortableDelay(750 * 2 ** (attempt - 1), signal);
        }
      }
      responses.push(draftsResponse);
      let localDrafts: DraftQuestion[];
      try {
        localDrafts = parseDrafts(draftsResponse.text, count, new Set(window.segments.map((segment) => segment.id)));
      } catch (error) {
        onProgress("extracting", 18, `窗口 ${label} 的题目解析失败`, { state: "failed", details: {
          kind: "validation", validation: { label: "题目规划解析", passed: false, issues: [error instanceof Error ? error.message : String(error)] },
        } });
        throw error;
      }
      perWindow[index]!.push(...localDrafts);
      for (const draft of localDrafts) {
        draftContexts.set(draft, windowContext);
        draftWindows.set(draft, index);
      }
      onProgress("extracting", 18 + Math.round(16 * (index + 1) / plan.windows.length), `窗口 ${label} 已生成 ${localDrafts.length} 道局部候选`, {
        state: "completed", providerId: draftsResponse.model.providerId, modelId: draftsResponse.model.modelId,
        usage: draftsResponse.usage,
        details: { kind: "window-plan", windowIndex: index + 1, windowCount: plan.windows.length, windowHash, windowLabel: label },
      });
    };
    for (const [index, window] of plan.windows.entries()) {
      await processWindow(window, counts[index]!, index, `${index + 1}/${plan.windows.length}`);
    }
    const priorityWindowCount = Math.min(input.questionCount, perWindow.length);
    const priorityWindows = Array.from({ length: priorityWindowCount }, (_, index) =>
      Math.min(perWindow.length - 1, Math.floor((index + 0.5) * perWindow.length / priorityWindowCount)));
    const windowOrder = [...priorityWindows, ...perWindow.map((_, index) => index).filter((index) => !priorityWindows.includes(index))];
    const collectDistinct = (): DraftQuestion[] => {
      const unique = new Set<string>();
      const distinct: DraftQuestion[] = [];
      for (let round = 0; round < Math.max(...perWindow.map((items) => items.length)); round += 1) {
        for (const windowIndex of windowOrder) {
          const draft = perWindow[windowIndex]![round];
          if (!draft) continue;
          const key = draft.question.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
          if (unique.has(key)) continue;
          unique.add(key);
          distinct.push(draft);
        }
      }
      return distinct;
    };
    let distinct = collectDistinct();
    for (let round = 1; distinct.length < input.questionCount && round <= 3; round += 1) {
      const deficit = input.questionCount - distinct.length;
      const perWindowTopUp = Math.max(1, Math.ceil(deficit / plan.windows.length));
      onProgress("extracting", 33, `跨窗口去重后还差 ${deficit} 道；第 ${round}/3 轮按窗口均衡补题，每窗 ${perWindowTopUp} 道`, { state: "running" });
      for (const [index, window] of plan.windows.entries()) {
        await processWindow(window, perWindowTopUp, index, `${index + 1}/${plan.windows.length} · 补题 ${round}`, `topup-${round}`);
      }
      distinct = collectDistinct();
    }
    const selected = distinct.slice(0, input.questionCount);
    if (selected.length < input.questionCount) throw new Error(`跨窗口去重后仅剩 ${selected.length}/${input.questionCount} 道不同题目；请调整资料或重新生成`);
    const drafts = selected.map((draft, ordinal) => ({ ...draft, ordinal }));
    const selectedContexts = drafts.map((_, index) => draftContexts.get(selected[index]!) ?? context);
    const contextByOrdinal = new Map(drafts.map((draft, index) => [draft.ordinal, selectedContexts[index]!]));
    const windowSelection = counts.map((target, index) => `窗口 ${index + 1}：选用 ${selected.filter((draft) => draftWindows.get(draft) === index).length}/${target} 道`);
    onProgress("extracting", 34, `全部 ${perWindow.length} 个窗口已覆盖；局部候选 ${perWindow.flat().length} 道，去重后 ${distinct.length} 道，选出 ${drafts.length} 道；${windowSelection.join(" · ")}`, {
      state: "completed", details: { kind: "validation", validation: { label: "资料覆盖、窗口选题分布与跨窗口去重", passed: true, issues: windowSelection } },
    });

    onProgress("answering", 46, "正在分批生成答案、评分标准和原文证据", { state: "running" });
    const answerBatches = batches(drafts, ANSWER_BATCH_SIZE);
    const completed: Array<CompletedQuestion & { adjustedRubric: boolean }> = [];
    for (const [batchIndex, draftBatch] of answerBatches.entries()) {
      const completedBeforeBatch = completed.length;
      const responseOffset = responses.length;
      const batchCompleted = await this.completeAnswerBatch({
        targetRole: input.targetRole,
        drafts: draftBatch,
        contextByOrdinal,
        validSegments,
        signal,
        responses,
        onProgress,
        progress: 46 + Math.round(24 * completedBeforeBatch / drafts.length),
        aiSettings,
        previousEvents: input.previousEvents,
      });
      completed.push(...batchCompleted);
      const batchResponses = responses.slice(responseOffset);
      const finalResponse = batchResponses.at(-1)!;
      const extraCalls = batchResponses.length - 1;
      onProgress("answering", 46 + Math.round(24 * completed.length / drafts.length), `已完成 ${completed.length}/${drafts.length} 道题目的答案、Rubric 与证据绑定（批次 ${batchIndex + 1}/${answerBatches.length}${extraCalls > 0 ? `，额外调用 ${extraCalls} 次` : ""}）`, {
        state: "completed",
        providerId: finalResponse.model.providerId,
        modelId: finalResponse.model.modelId,
        usage: usageSum(batchResponses.map((response) => response.usage)),
      });
    }

    onProgress("validating", 78, "正在独立校验答案与证据", { state: "running" });
    const reviewSystem = knowledgeSystemPrompt("review", aiSettings.stages.review.additionalSystemInstruction);
    const reviewBudget = fullInputBudget(aiSettings).budget;
    const reviews: Review[] = completed.map((_, ordinal) => ({ ordinal, verdict: "needs_review", notes: ["独立审核尚未返回结果"] }));
    let reviewedCount = 0;
    const processReviewBatch = async (questions: typeof completed, start: number, label: string): Promise<void> => {
      signal.throwIfAborted();
      const localQuestions = questions.map((question, ordinal) => ({ ...question, ordinal }));
      const reviewSegmentIds = new Set(localQuestions.flatMap((question) => [
        ...question.evidenceSegmentIds, ...question.evidence.map((item) => item.segmentId),
      ]));
      let reviewContext = context.filter((segment) => reviewSegmentIds.has(segment.segmentId));
      const reviewSchema = requestSchema("review", localQuestions.length);
      const estimateReview = (sources: typeof reviewContext) => estimateJsonRequestTokens(reviewSystem,
        { sources, questions: localQuestions }, "knowledge_studio_review_v1", reviewSchema);
      const splitReview = async (reason: string) => {
        const midpoint = Math.floor(questions.length / 2);
        onProgress("validating", 79 + Math.round(15 * reviewedCount / completed.length),
          `审核批次 ${label} ${reason}；拆为 ${midpoint} 和 ${questions.length - midpoint} 道继续`, { state: "running" });
        await processReviewBatch(questions.slice(0, midpoint), start, `${label}.1`);
        await processReviewBatch(questions.slice(midpoint), start + midpoint, `${label}.2`);
      };
      if (estimateReview(reviewContext) > reviewBudget) {
        const excerptKeys = new Set<string>();
        const excerpts: typeof reviewContext = [];
        for (const segment of reviewContext) {
          const quotes = localQuestions.flatMap((question) => question.evidence
            .filter((item) => item.segmentId === segment.segmentId).map((item) => item.quote));
          const starts = quotes.length ? quotes.map((quote) => Math.max(0, segment.content.indexOf(quote) - 500)) : [0];
          for (const excerptStart of starts) {
            const key = `${segment.segmentId}:${excerptStart}`;
            if (excerptKeys.has(key)) continue;
            excerptKeys.add(key);
            excerpts.push({ ...segment, content: segment.content.slice(excerptStart, excerptStart + 1_500) });
          }
        }
        onProgress("validating", 79, `审核批次 ${label} 原文超预算；改用 ${excerpts.length} 段引文附近摘录`, {
          state: "running", details: { kind: "validation", validation: { label: "独立审核输入预算", passed: true,
            issues: [`原始输入预计 ${estimateReview(reviewContext)} tokens，摘录后预计 ${estimateReview(excerpts)} tokens，预算 ${reviewBudget} tokens`] } },
        });
        reviewContext = excerpts;
      }
      if (estimateReview(reviewContext) > reviewBudget) {
        if (questions.length > 1) { await splitReview("输入仍超预算"); return; }
        throw new Error(`第 ${start + 1} 题独立审核输入预计 ${estimateReview(reviewContext)} tokens，超过 ${reviewBudget} token 预算`);
      }
      const reviewPayload = { sources: reviewContext, questions: localQuestions };
      const checkpointHash = createHash("sha256").update(JSON.stringify({
        promptVersion: KNOWLEDGE_STUDIO_PROMPT_VERSION, model: aiSettings.model,
        thinkingLevel: aiSettings.thinkingLevel, system: reviewSystem, payload: reviewPayload,
      })).digest("hex");
      for (const event of [...(input.previousEvents ?? [])].reverse()) {
        if (event.details?.kind !== "model-call" || event.details.phase !== "response"
          || event.details.purpose !== "review" || event.details.checkpointHash !== checkpointHash
          || !event.details.responseText || !event.providerId || !event.modelId) continue;
        try {
          const restored = parseReviews(event.details.responseText, localQuestions.length);
          for (const [index, review] of restored.entries()) reviews[start + index] = { ...review, ordinal: start + index };
          responses.push({ requestId: event.details.requestId ?? "checkpoint",
            model: { providerId: event.providerId, modelId: event.modelId }, text: event.details.responseText,
            finishReason: "stop", usage: event.usage ?? {} });
          reviewedCount += questions.length;
          onProgress("validating", 79 + Math.round(15 * reviewedCount / completed.length),
            `审核批次 ${label} 复用已完成结果，不再调用模型`, { state: "completed" });
          return;
        } catch { /* Invalid or obsolete responses are not checkpoints. */ }
      }
      try {
        let reviewResponse: ModelResponse | undefined;
        for (let attempt = 1; !reviewResponse; attempt += 1) {
          try {
            reviewResponse = await this.call({
              stage: "review", count: localQuestions.length, signal,
              onProgress, progress: 79 + Math.round(15 * reviewedCount / completed.length),
              system: reviewSystem, aiSettings, checkpointHash,
              payload: reviewPayload,
            });
          } catch (error) {
            if (!isTransientNetworkError(error) || signal.aborted || attempt >= MAX_NETWORK_ATTEMPTS) throw error;
            onProgress("validating", 79 + Math.round(15 * reviewedCount / completed.length),
              `审核批次 ${label} 请求暂时失败，准备第 ${attempt + 1}/${MAX_NETWORK_ATTEMPTS} 次尝试（最多重试 ${MAX_NETWORK_RETRIES} 次）`, { state: "running" });
            await abortableDelay(750 * 2 ** (attempt - 1), signal);
          }
        }
        responses.push(reviewResponse);
        const batchReviews = parseReviews(reviewResponse.text, localQuestions.length);
        for (const [index, review] of batchReviews.entries()) reviews[start + index] = { ...review, ordinal: start + index };
        reviewedCount += questions.length;
        onProgress("validating", 79 + Math.round(15 * reviewedCount / completed.length),
          `审核批次 ${label} 已完成 ${questions.length} 道；累计 ${reviewedCount}/${completed.length} 道`, {
            state: "completed", providerId: reviewResponse.model.providerId, modelId: reviewResponse.model.modelId,
            usage: reviewResponse.usage,
          });
      } catch (error) {
        const modelError = error instanceof KnowledgeModelError ? error : undefined;
        const needsSmallerBatch = modelError && (modelError.code === "budget_exceeded"
          || modelError.diagnosticCode === "CONTEXT_LIMIT" || modelError.code === "invalid_provider_response");
        if (!signal.aborted && questions.length > 1 && needsSmallerBatch) {
          await splitReview("被模型或输出结构拒绝");
          return;
        }
        if (!modelError?.retryable || signal.aborted) throw error;
        for (let index = 0; index < questions.length; index += 1) reviews[start + index] = {
          ordinal: start + index, verdict: "needs_review",
          notes: [`自动质量校验暂时不可用（${modelError.message}），已保留生成结果，请人工复核`],
        };
        reviewedCount += questions.length;
        onProgress("validating", 79 + Math.round(15 * reviewedCount / completed.length),
          `审核批次 ${label} 暂不可用，${questions.length} 道题已保留并标记人工复核`, { state: "completed" });
      }
    };
    for (const [batchIndex, questionBatch] of batches(completed, REVIEW_CALL_BATCH_SIZE).entries()) {
      await processReviewBatch(questionBatch, batchIndex * REVIEW_CALL_BATCH_SIZE,
        `${batchIndex + 1}/${Math.ceil(completed.length / REVIEW_CALL_BATCH_SIZE)}`);
    }
    onProgress("validating", 94, `已完成 ${reviews.length} 道候选题的分批独立质量审核`, {
      state: "completed", details: { kind: "validation", validation: { label: "分批独立审核", passed: true, issues: [] } },
    });
    const segmentById = new Map(input.segments.map((segment) => [segment.id, segment]));

    let unmatchedQuotes = 0;
    const candidates: StoredCandidate[] = completed.map((question, ordinal) => {
      const review = reviews[ordinal];
      const notes = [...review.notes];
      if (question.adjustedRubric) notes.push("模型返回的 Rubric 权重未合计 100，系统已归一化，请人工检查");
      const evidence: KnowledgeEvidence[] = question.evidence.flatMap((item) => {
        const segment = segmentById.get(item.segmentId);
        if (!segment) return [];
        if (!segment.content.includes(item.quote)) {
          unmatchedQuotes += 1;
          notes.push(`证据引用未能在原文片段 ${item.segmentId} 中逐字匹配`);
          return [];
        }
        return [{ segmentId: item.segmentId, sourceId: segment.sourceId, sourceTitle: segment.sourceTitle, quote: item.quote }];
      });
      let validationStatus = review.verdict;
      if (evidence.length === 0 && validationStatus === "supported") validationStatus = "needs_review";
      if (question.evidenceSegmentIds.length === 0) notes.push("问题规划阶段未绑定来源片段");
      return {
        ordinal, kind: question.kind, difficulty: question.difficulty, competency: question.competency,
        question: question.question, answer: question.answer, rubric: question.rubric,
        pitfalls: question.pitfalls, followUps: question.followUps, evidence,
        validationStatus, validationNotes: Array.from(new Set(notes)),
      };
    });
    onProgress("validating", 96, unmatchedQuotes ? `${unmatchedQuotes} 条原文引文未逐字匹配，已标记人工复核` : "原文引文逐字匹配检查完成", {
      state: "completed", details: { kind: "validation", validation: {
        label: "原文证据逐字匹配", passed: unmatchedQuotes === 0,
        issues: unmatchedQuotes ? [`${unmatchedQuotes} 条引文在对应原文片段中未找到，已从候选题证据中移除`] : [],
      } },
    });
    const last = responses.at(-1)!;
    const { previousEvents: _previousEvents, ...hashInput } = input;
    return {
      candidates,
      providerId: last.model.providerId,
      modelId: last.model.modelId,
      usage: usageSum(responses.map((response) => response.usage)),
      requestHash: createHash("sha256").update(JSON.stringify({ version: KNOWLEDGE_STUDIO_PROMPT_VERSION, input: hashInput })).digest("hex"),
    };
  }

  private async call(input: {
    stage: "drafts" | "answers" | "review";
    count: number;
    system: string;
    payload: unknown;
    signal: AbortSignal;
    onProgress: KnowledgeWorkflowProgress;
    progress: number;
    aiSettings: KnowledgeGenerationAiSettings;
    window?: { index: number; count: number; hash: string; label: string };
    checkpointHash?: string;
  }): Promise<ModelResponse> {
    input.signal.throwIfAborted();
    const schema = requestSchema(input.stage, input.count);
    const schemaName = `knowledge_studio_${input.stage}_v1`;
    const request: ModelRequest = {
      metadata: {
        moduleId: "knowledge-studio",
        purpose: `question-generation.${input.stage}`,
        privacy: "confidential",
        budget: {
          timeoutMs: input.aiSettings.timeoutMs,
          maxInputTokens: fullInputBudget(input.aiSettings).budget,
        },
      },
      messages: [{ role: "system", content: input.system }, { role: "user", content: JSON.stringify(input.payload) }],
      ...(input.aiSettings.model ? { model: input.aiSettings.model } : {}),
      ...(input.aiSettings.thinkingLevel && input.aiSettings.thinkingLevel !== "default"
        ? { reasoning: input.aiSettings.thinkingLevel }
        : {}),
      responseFormat: { type: "json", schemaName, jsonSchema: schema },
    };
    const stage = input.stage === "drafts" ? "extracting" : input.stage === "answers" ? "answering" : "validating";
    const details: NonNullable<KnowledgeGenerationEvent["details"]> = {
      kind: "model-call", phase: "request", purpose: input.stage,
      callId: randomUUID(),
      ...(input.checkpointHash ? { checkpointHash: input.checkpointHash } : {}),
      promptVersion: KNOWLEDGE_STUDIO_PROMPT_VERSION,
      systemPrompt: input.system, userPayload: request.messages[1]!.content,
      schemaName, jsonSchema: schema,
      timeoutMs: request.metadata.budget!.timeoutMs!,
      maxInputTokens: request.metadata.budget!.maxInputTokens!,
      reasoning: request.reasoning ?? "模型默认",
      ...(input.window ? { windowIndex: input.window.index, windowCount: input.window.count, windowHash: input.window.hash, windowLabel: input.window.label } : {}),
    };
    input.onProgress(stage, input.progress, `已组装${input.stage === "drafts" ? "问题规划" : input.stage === "answers" ? "答案生成" : "质量校验"}请求；尚不能确定供应商已收到`, { state: "running", details });
    const startedAt = Date.now();
    let lastSnapshotAt = startedAt;
    let pendingCharacters = 0;
    let responseText = "";
    let reasoningText = "";
    let firstResponseRecorded = false;
    let resolvedModel: ModelResponse["model"] | undefined;
    let requestId: string | undefined;
    const streamDetails = (): NonNullable<KnowledgeGenerationEvent["details"]> => ({
      kind: "model-call", phase: "stream", purpose: input.stage, callId: details.callId, requestId,
      ...(input.checkpointHash ? { checkpointHash: input.checkpointHash } : {}),
      ...(input.window ? { windowIndex: input.window.index, windowCount: input.window.count, windowHash: input.window.hash, windowLabel: input.window.label } : {}),
      responseText, ...(reasoningText ? { reasoningText } : {}), elapsedMs: Date.now() - startedAt,
    });
    try {
      let result: ModelResponse | undefined;
      for await (const event of this.gateway.stream(request, { signal: input.signal })) {
        if (event.type === "started") {
          resolvedModel = event.model;
          requestId = event.requestId;
          input.onProgress(stage, input.progress, "网关已解析模型并准备发起请求；等待供应商响应", {
            state: "running", providerId: event.model.providerId, modelId: event.model.modelId,
            details: { kind: "model-call", phase: "prepared", purpose: input.stage, callId: details.callId,
              ...(input.checkpointHash ? { checkpointHash: input.checkpointHash } : {}),
              ...(input.window ? { windowIndex: input.window.index, windowCount: input.window.count, windowHash: input.window.hash, windowLabel: input.window.label } : {}),
              requestId, effectiveSystemPrompt: event.diagnostics?.effectiveSystemPrompt,
              estimatedInputTokens: event.diagnostics?.estimatedInputTokens,
              inputTextCharacters: event.diagnostics?.inputTextCharacters,
              modelContextWindowTokens: event.diagnostics?.modelContextWindowTokens,
              effectiveTimeoutMs: event.diagnostics?.effectiveTimeoutMs,
              maxOutputTokens: event.diagnostics?.maxOutputTokens,
              temperatureApplied: event.diagnostics?.temperatureApplied,
              effectiveTemperature: event.diagnostics?.effectiveTemperature,
              reasoning: event.diagnostics?.reasoning,
              providerMaxRetries: event.diagnostics?.providerMaxRetries },
          });
        } else if (event.type === "text_delta" || event.type === "reasoning_delta") {
          if (event.type === "text_delta") responseText += event.delta;
          else reasoningText += event.delta;
          if (!firstResponseRecorded && event.delta.length > 0) {
            firstResponseRecorded = true;
            input.onProgress(stage, input.progress, `收到首段模型${event.type === "reasoning_delta" ? "可展示思考" : "输出"}（距调用组装 ${Date.now() - startedAt} 毫秒）`, {
              state: "running", providerId: resolvedModel?.providerId, modelId: resolvedModel?.modelId,
              details: streamDetails(),
            });
          }
          pendingCharacters += event.delta.length;
          const now = Date.now();
          if (pendingCharacters >= 80 && now - lastSnapshotAt >= 1_000) {
            input.onProgress(stage, input.progress, `模型正在${event.type === "reasoning_delta" ? "思考" : "输出"} · 已接收 ${responseText.length.toLocaleString()} 字符`, {
              state: "running", providerId: resolvedModel?.providerId, modelId: resolvedModel?.modelId,
              details: streamDetails(),
            });
            lastSnapshotAt = now;
            pendingCharacters = 0;
          }
        } else if (event.type === "failed") {
          throw new KnowledgeModelError(event.error.message, event.error.retryable, event.error.code, event.error.statusCode, event.error.diagnosticCode, event.error.validationIssues);
        } else if (event.type === "completed") {
          result = event.response;
        }
      }
      if (!result) throw new KnowledgeModelError("模型流没有返回完成事件", true);
      if (result.finishReason === "length") throw new KnowledgeModelError("模型输出达到自身长度限制，JSON 可能不完整", true, "invalid_provider_response");
      if (!result.text.trim()) throw new KnowledgeModelError("模型返回了空内容", true);
      input.onProgress(stage, input.progress, "模型输出已通过 JSON 解析与 Schema 结构校验", {
        state: "completed", details: { kind: "validation", validation: { label: `${input.stage} JSON / Schema`, passed: true, issues: [] } },
      });
      input.onProgress(stage, input.progress, "已收到模型回复", {
        state: "completed", providerId: result.model.providerId, modelId: result.model.modelId,
        usage: result.usage,
        details: { kind: "model-call", phase: "response", purpose: input.stage, callId: details.callId,
          ...(input.checkpointHash ? { checkpointHash: input.checkpointHash } : {}),
          ...(input.window ? { windowIndex: input.window.index, windowCount: input.window.count, windowHash: input.window.hash, windowLabel: input.window.label } : {}),
          requestId: result.requestId, responseText: result.text,
          finishReason: result.finishReason,
          ...(result.reasoningText || reasoningText ? { reasoningText: result.reasoningText ?? reasoningText } : {}),
          elapsedMs: Date.now() - startedAt },
      });
      return result;
    } catch (error) {
      if (error instanceof KnowledgeModelError && error.validationIssues?.length) {
        input.onProgress(stage, input.progress, "模型输出未通过 JSON / Schema 校验", { state: "failed", details: {
          kind: "validation", validation: { label: `${input.stage} JSON / Schema`, passed: false, issues: error.validationIssues },
        } });
      }
      input.onProgress(stage, input.progress, "模型调用失败，正在判断是否重试", {
        state: "failed", providerId: resolvedModel?.providerId, modelId: resolvedModel?.modelId,
        details: { kind: "model-call", phase: "error", purpose: input.stage, callId: details.callId, requestId,
          ...(input.checkpointHash ? { checkpointHash: input.checkpointHash } : {}),
          ...(input.window ? { windowIndex: input.window.index, windowCount: input.window.count, windowHash: input.window.hash, windowLabel: input.window.label } : {}),
          responseText, ...(reasoningText ? { reasoningText } : {}),
          error: error instanceof Error ? error.message : String(error), elapsedMs: Date.now() - startedAt,
          ...(error instanceof KnowledgeModelError ? { errorCode: error.code, diagnosticCode: error.diagnosticCode, statusCode: error.statusCode, retryable: error.retryable,
            validationIssues: error.validationIssues } : {}) },
      });
      throw error;
    }
  }

  private async completeAnswerBatch(input: {
    targetRole: string;
    drafts: DraftQuestion[];
    contextByOrdinal: Map<number, Array<{ segmentId: string; sourceTitle: string; heading?: string; content: string }>>;
    validSegments: Set<string>;
    signal: AbortSignal;
    responses: ModelResponse[];
    onProgress: KnowledgeWorkflowProgress;
    progress: number;
    aiSettings: KnowledgeGenerationAiSettings;
    previousEvents?: KnowledgeGenerationEvent[];
    attempt?: number;
    qualityAttempt?: number;
    qualityFeedback?: { previousAnswer: string; issues: string[] };
  }): Promise<Array<CompletedQuestion & { adjustedRubric: boolean }>> {
    input.signal.throwIfAborted();
    const relevantContext = input.drafts.flatMap((draft) => {
      const sourceWindow = input.contextByOrdinal.get(draft.ordinal) ?? [];
      const relevantIds = new Set(draft.evidenceSegmentIds);
      const matching = sourceWindow.filter((segment) => relevantIds.has(segment.segmentId));
      return matching.length > 0 ? matching : sourceWindow;
    });
    const sourceKeys = new Set<string>();
    const sources = relevantContext.filter((segment) => {
      const key = `${segment.segmentId}:${segment.content}`;
      if (sourceKeys.has(key)) return false;
      sourceKeys.add(key);
      return true;
    });
    const localDrafts = input.drafts.map((draft, ordinal) => ({ ...draft, ordinal }));
    const system = knowledgeSystemPrompt("answers", input.aiSettings.stages.answers.additionalSystemInstruction);
    const basePayload = { targetRole: input.targetRole, drafts: localDrafts, sources };
    const checkpointHash = createHash("sha256").update(JSON.stringify({
      promptVersion: KNOWLEDGE_STUDIO_PROMPT_VERSION, model: input.aiSettings.model,
      thinkingLevel: input.aiSettings.thinkingLevel, system, payload: basePayload,
    })).digest("hex");
    if (!input.qualityFeedback && !input.attempt) {
      for (const event of [...(input.previousEvents ?? [])].reverse()) {
        if (event.details?.kind !== "model-call" || event.details.phase !== "response"
          || event.details.purpose !== "answers" || event.details.checkpointHash !== checkpointHash
          || !event.details.responseText || !event.providerId || !event.modelId) continue;
        try {
          const restored = parseCompleted(event.details.responseText, input.drafts, input.validSegments);
          if (restored.some((question) => answerQualityIssues(question.answer).length > 0)) continue;
          input.responses.push({ requestId: event.details.requestId ?? "checkpoint",
            model: { providerId: event.providerId, modelId: event.modelId }, text: event.details.responseText,
            finishReason: "stop", usage: event.usage ?? {} });
          const range = input.drafts.length === 1 ? `第 ${input.drafts[0]!.ordinal + 1} 题`
            : `第 ${input.drafts[0]!.ordinal + 1}–${input.drafts.at(-1)!.ordinal + 1} 题`;
          input.onProgress("answering", input.progress, `${range}复用已验收答案，不再调用模型`, { state: "completed" });
          return restored;
        } catch { /* Invalid or obsolete responses are not checkpoints. */ }
      }
    }
    const splitBatch = async (reason: string): Promise<Array<CompletedQuestion & { adjustedRubric: boolean }>> => {
      const middle = Math.floor(input.drafts.length / 2);
      input.onProgress("answering", input.progress,
        `第 ${input.drafts[0]!.ordinal + 1}–${input.drafts.at(-1)!.ordinal + 1} 题${reason}，拆为 ${middle} 和 ${input.drafts.length - middle} 道继续`,
        { state: "running" });
      const first = await this.completeAnswerBatch({ ...input, drafts: input.drafts.slice(0, middle), attempt: 1 });
      const second = await this.completeAnswerBatch({ ...input, drafts: input.drafts.slice(middle), attempt: 1 });
      return [...first, ...second];
    };
    let response: ModelResponse;
    try {
      response = await this.call({
        stage: "answers",
        count: input.drafts.length,
        signal: input.signal,
        onProgress: input.onProgress, progress: input.progress,
        system, aiSettings: input.aiSettings, checkpointHash,
        payload: {
          ...basePayload,
          ...(input.qualityFeedback ? {
            revision: {
              ...input.qualityFeedback,
              instruction: "上一版参考答案未通过格式验收。请依据原文重新写出口语化的短答案，修复列出的全部问题；rubric、pitfalls、followUps 和 evidence 仍放在独立字段，并重新输出完整 JSON。不要截断原答案。",
            },
          } : {}),
        },
      });
    } catch (error) {
      if (input.signal.aborted) throw error;
      if (isTransientNetworkError(error)) {
        const attempt = input.attempt ?? 1;
        if (attempt >= MAX_NETWORK_ATTEMPTS) {
          throw new KnowledgeModelError(`第 ${input.drafts[0]!.ordinal + 1}–${input.drafts.at(-1)!.ordinal + 1} 题答案生成连续 ${attempt} 次请求失败，请稍后重试或更换模型`,
            true, error.code, error.statusCode, error.diagnosticCode);
        }
        const nextAttempt = attempt + 1;
        input.onProgress("answering", input.progress, `答案批次请求暂时失败，准备第 ${nextAttempt}/${MAX_NETWORK_ATTEMPTS} 次尝试（最多重试 ${MAX_NETWORK_RETRIES} 次）`, { state: "running" });
        await abortableDelay(750 * 2 ** (attempt - 1), input.signal);
        return this.completeAnswerBatch({ ...input, attempt: nextAttempt });
      }
      const modelError = error instanceof KnowledgeModelError ? error : undefined;
      if (input.drafts.length > 1 && modelError && (modelError.code === "budget_exceeded"
        || modelError.code === "invalid_provider_response" || modelError.diagnosticCode === "CONTEXT_LIMIT")) {
        return splitBatch("输入或输出超限");
      }
      throw error;
    }
    input.responses.push(response);
    let completed: Array<CompletedQuestion & { adjustedRubric: boolean }>;
    try {
      completed = parseCompleted(response.text, input.drafts, input.validSegments);
    } catch (error) {
      input.onProgress("answering", input.progress, "答案与证据解析失败", { state: "failed", details: {
        kind: "validation", validation: { label: "答案、Rubric 与证据解析", passed: false,
          issues: [error instanceof Error ? error.message : String(error)] },
      } });
      if (input.drafts.length > 1) return splitBatch("返回结构不完整");
      throw error;
    }
    const issueGroups = completed.map((question) => answerQualityIssues(question.answer));
    const failures = completed.flatMap((question, index) => issueGroups[index]!.map((issue) => ({ question, issue })));
    input.onProgress("answering", input.progress, failures.length ? "参考答案未通过口语化与长度验收" : "参考答案通过口语化与长度验收", {
      state: failures.length ? "failed" : "completed", details: { kind: "validation", validation: {
        label: "参考答案硬性验收（≤300 字、无清单、最多两段）", passed: failures.length === 0,
        issues: failures.map(({ question, issue }) => `第 ${question.ordinal + 1} 题：${issue}`),
      } },
    });
    if (failures.length === 0) return completed;
    const qualityAttempt = input.qualityAttempt ?? 1;
    if (qualityAttempt >= MAX_ANSWER_QUALITY_ATTEMPTS) {
      throw new KnowledgeModelError(`答案连续 ${qualityAttempt} 次未通过格式验收：${failures.map(({ question, issue }) => `第 ${question.ordinal + 1} 题：${issue}`).join("；")}。请调整提示词或更换模型后重试。`, false, "answer_quality");
    }
    const repaired = [...completed];
    for (const [index, issues] of issueGroups.entries()) {
      if (!issues.length) continue;
      const question = completed[index]!;
      input.onProgress("answering", input.progress,
        `第 ${question.ordinal + 1} 题答案格式未通过验收，正在单独重写（${qualityAttempt + 1}/${MAX_ANSWER_QUALITY_ATTEMPTS}）：${issues.join("；")}`,
        { state: "running" });
      const replacement = await this.completeAnswerBatch({
        ...input, drafts: [input.drafts[index]!], attempt: 1, qualityAttempt: qualityAttempt + 1,
        qualityFeedback: { previousAnswer: question.answer.slice(0, 600), issues },
      });
      repaired[index] = replacement[0]!;
    }
    return repaired;
  }
}

export type { KnowledgeQuestionCandidate };
