import type { ModelGateway, ModelRequest } from "../../platform/shared/ai/model-gateway";
import { DEFAULT_INTERVIEW_CHAT_MODEL, INTERVIEW_SCORE_DIMENSIONS, type InterviewChatModel,
  type InterviewCallTrace, type InterviewChatSettings, type InterviewScoreDimension,
  type InterviewSession } from "../../shared/contracts/interview";
import { DEFAULT_INTERVIEW_SCORE_PROMPT } from "../../shared/interview-score";
import { INTERVIEW_CHAT_TIMEOUT_MS } from "../../shared/interview-chat-prompt";
import { generateInterviewJson } from "./interview-json-agent-retry";
import { INTERVIEW_SCORE_SCHEMA } from "./interview-output-schema";

export function parseInterviewScore(text: string, session: InterviewSession): InterviewScoreDimension[] {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const parsed: unknown = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("评分结果不是 JSON 对象");
  const raw = (parsed as Record<string, unknown>).dimensions;
  if (!Array.isArray(raw) || raw.length !== INTERVIEW_SCORE_DIMENSIONS.length) throw new Error("评分维度不完整");
  const answers = new Map(session.turns.filter((turn) => turn.role === "candidate")
    .map((turn) => [turn.id, turn.content]));
  const seen = new Set<string>();
  const result: InterviewScoreDimension[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("评分维度格式无效");
    const item = value as Record<string, unknown>;
    const dimension = INTERVIEW_SCORE_DIMENSIONS.find((entry) => entry.key === item.key);
    if (!dimension || seen.has(dimension.key)) throw new Error("评分维度重复或未知");
    seen.add(dimension.key);
    if (item.score !== null && (!Number.isInteger(item.score)
      || (item.score as number) < 0 || (item.score as number) > dimension.maxScore)) {
      throw new Error(`${dimension.label}的分数超出范围`);
    }
    if (typeof item.reason !== "string" || !item.reason.trim() || item.reason.length > 2_000) {
      throw new Error(`${dimension.label}缺少有效评分依据`);
    }
    if (!Array.isArray(item.evidence) || item.evidence.length > 3
      || (item.score === null ? item.evidence.length !== 0 : item.evidence.length === 0)) {
      throw new Error(`${dimension.label}的引用数量无效`);
    }
    const evidence = item.evidence.map((entry: unknown) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("评分引用格式无效");
      const quote = entry as Record<string, unknown>;
      if (typeof quote.turnId !== "string" || typeof quote.quote !== "string"
        || !quote.quote.trim() || quote.quote.length > 500
        || !answers.get(quote.turnId)?.includes(quote.quote)) {
        throw new Error("评分引用与候选人回答不匹配");
      }
      return { turnId: quote.turnId, quote: quote.quote };
    });
    result.push({ key: dimension.key, score: item.score as number | null,
      reason: item.reason.trim(), evidence });
  }
  return INTERVIEW_SCORE_DIMENSIONS.map((dimension) => result.find((item) => item.key === dimension.key)!);
}

export class InterviewScoreAgent {
  constructor(private readonly gateway: ModelGateway) {}

  async score(session: InterviewSession, operationId: string, settings: InterviewChatSettings,
    prompt = DEFAULT_INTERVIEW_SCORE_PROMPT, signal?: AbortSignal,
    onTrace?: (trace: InterviewCallTrace) => void): Promise<{
      dimensions: InterviewScoreDimension[]; model: InterviewChatModel; rawOutput: string;
    }> {
    const requestedModel = settings.model ?? DEFAULT_INTERVIEW_CHAT_MODEL;
    const job = session.interview.documents.find((document) => document.kind === "job_description")?.content ?? "";
    const resume = session.interview.documents.find((document) => document.kind === "resume")?.content ?? "";
    const request: ModelRequest = {
      metadata: { moduleId: "interview", purpose: "score_interview", privacy: "confidential",
        traceId: operationId, budget: { timeoutMs: INTERVIEW_CHAT_TIMEOUT_MS } },
      model: requestedModel,
      responseFormat: { type: "json", schemaName: "interview_score_v1", jsonSchema: INTERVIEW_SCORE_SCHEMA },
      ...(settings.reasoning === "default" ? {} : { reasoning: settings.reasoning }),
      messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify({
        position: session.interview.positionTitle, jobDescription: job, resume,
        turns: session.turns.map((turn) => ({ id: turn.id, role: turn.role, content: turn.content })),
      }) }],
    };
    const now = new Date().toISOString();
    const trace: InterviewCallTrace = {
      actor: "score", operationId, status: "failed", startedAt: now, finishedAt: now,
      requestedModel, reasoning: settings.reasoning, timeoutMs: INTERVIEW_CHAT_TIMEOUT_MS,
      messages: [{ kind: "system_prompt", role: "system", content: prompt },
        { kind: "score_material", role: "user", content: request.messages[1]!.content }],
      attempts: [],
    };
    try {
      if (settings.model && this.gateway.getAvailableModels) {
        const models = await this.gateway.getAvailableModels();
        const selected = models.find((model) => model.providerId === requestedModel.providerId
          && model.modelId === requestedModel.modelId);
        if (!selected) throw new Error("所选评分模型已不可用");
        if (settings.reasoning !== "default" && !selected.reasoningLevels.includes(settings.reasoning)) {
          throw new Error("所选评分模型不支持本场固定思考深度");
        }
      }
      const { value: dimensions, response } = await generateInterviewJson({ gateway: this.gateway,
        request, trace, signal, parse: (text) => parseInterviewScore(text, session),
        ...(!settings.model && requestedModel.providerId === DEFAULT_INTERVIEW_CHAT_MODEL.providerId
          ? { fallbackModel: { providerId: "openai", modelId: requestedModel.modelId } } : {}),
      });
      trace.status = "succeeded";
      trace.finishedAt = new Date().toISOString();
      onTrace?.(trace);
      return { dimensions, model: response.model, rawOutput: response.text };
    } catch (error) {
      trace.finishedAt = new Date().toISOString();
      trace.error = { code: trace.attempts.at(-1)?.error?.code ?? "interview_score_failed",
        message: error instanceof Error ? error.message : String(error) };
      onTrace?.(trace);
      throw error;
    }
  }
}
