import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { ModelGateway, ModelRequest } from "../../platform/shared/ai/model-gateway";
import { DEFAULT_DIRECTOR_CHAT_SETTINGS, DEFAULT_INTERVIEW_CHAT_MODEL,
  INTERVIEW_QUESTION_TYPES, type InterviewCallTrace, type InterviewChatSettings,
  type InterviewSession } from "../../shared/contracts/interview";
import { buildInterviewDirectorMessages, DEFAULT_INTERVIEW_DIRECTOR_PROMPT } from "../../shared/interview-director-prompt";
import { INTERVIEW_CHAT_TIMEOUT_MS } from "../../shared/interview-chat-prompt";
import type { DirectorTopicReport } from "../../shared/interview-topic-flow";
import { generateInterviewJson } from "./interview-json-agent-retry";
import { interviewCacheSessionId } from "./interview-cache-session";
import { INTERVIEW_DIRECTOR_SCHEMA } from "./interview-output-schema";

export type InterviewDirectorDecision = { action: "pass" | "correct" | "redirect" | "close"; reason: string;
  guidance: string; flow: DirectorTopicReport };
const DirectorState = Annotation.Root({ request: Annotation<ModelRequest>(), text: Annotation<string>(),
  decision: Annotation<InterviewDirectorDecision>() });

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 必须是 JSON 对象`);
  return value as Record<string, unknown>;
}

function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value !== "string" || !choices.includes(value as T)) throw new Error(`${label} 无效`);
  return value as T;
}

function boundedText(value: unknown, label: string, max: number, required = true): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error(`${label} 无效`);
  return value.trim();
}

function parseTopicReport(value: unknown): DirectorTopicReport {
  const flow = object(value, "导演话题记录");
  const answeredTopic = object(flow.answeredTopic, "已回答话题");
  const draft = object(flow.draft, "草稿话题");
  if (!Array.isArray(flow.answerCoverage) || flow.answerCoverage.length > 4) throw new Error("导演能力覆盖记录无效");
  if (!Array.isArray(flow.roleGaps) || flow.roleGaps.length > 4) throw new Error("导演岗位能力缺口记录无效");
  return {
    answeredTopic: {
      source: choice(answeredTopic.source, INTERVIEW_QUESTION_TYPES, "已回答话题来源"),
      anchor: boundedText(answeredTopic.anchor, "已回答话题名称", 160),
      objective: boundedText(answeredTopic.objective, "已回答话题目标", 200),
    },
    answerEvidence: choice(flow.answerEvidence, ["new", "limited", "none"], "回答证据等级"),
    answerCoverage: flow.answerCoverage.map((entry: unknown) => {
      const item = object(entry, "能力覆盖项");
      return { kind: choice(item.kind, ["role", "foundation"], "能力覆盖类型"),
        label: boundedText(item.label, "能力名称", 160) };
    }),
    roleGaps: flow.roleGaps.map((entry: unknown) => {
      const item = object(entry, "岗位能力缺口");
      return { label: boundedText(item.label, "岗位能力名称", 160) };
    }),
    foundationNeed: choice(flow.foundationNeed, ["unknown", "needed", "satisfied", "not_needed"], "基础知识补问状态"),
    draft: {
      move: choice(draft.move, ["continue", "switch", "revisit", "close"], "草稿话题动作"),
      source: choice(draft.source, INTERVIEW_QUESTION_TYPES, "草稿问题来源"),
      anchor: boundedText(draft.anchor, "草稿话题名称", 160),
      objective: boundedText(draft.objective, "草稿话题目标", 200),
      targetBlockId: boundedText(draft.targetBlockId, "回访目标段落", 60, false),
      bridge: choice(draft.bridge, ["present", "missing", "not_needed"], "过渡状态"),
      switchReason: choice(draft.switchReason,
        ["none", "sufficient", "no_more_evidence", "candidate_shift", "coverage_priority", "new_contradiction"], "换段理由"),
    },
  };
}

function parseDecision(text: string): InterviewDirectorDecision {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const value: unknown = JSON.parse(cleaned);
  const record = object(value, "导演输出");
  if (record.action !== "pass" && record.action !== "correct" && record.action !== "redirect" && record.action !== "close") {
    throw new Error("导演返回了无效动作");
  }
  if (typeof record.reason !== "string" || !record.reason.trim() || record.reason.length > 2_000) {
    throw new Error("导演没有提供有效的判断依据");
  }
  if (typeof record.guidance !== "string" || record.guidance.length > 2_000
    || (record.action !== "pass" && !record.guidance.trim())) {
    throw new Error("导演没有提供有效的改写方向");
  }
  const flow = parseTopicReport(record.flow);
  if ((record.action === "close") !== (flow.draft.move === "close")) throw new Error("导演收尾动作与话题记录不一致");
  if (record.action === "close" && flow.draft.source !== "other") throw new Error("导演收尾消息必须标为 other");
  return { action: record.action, reason: record.reason.trim(), guidance: record.guidance.trim(), flow };
}

export class InterviewDirectorAgent {
  constructor(private readonly gateway: ModelGateway) {}

  async review(session: InterviewSession, answer: string, draft: string, operationId: string, options: {
    settings?: InterviewChatSettings; prompt?: string; signal?: AbortSignal;
    onTrace?: (trace: InterviewCallTrace) => void;
  } = {}): Promise<{ decision: InterviewDirectorDecision; trace: InterviewCallTrace }> {
    const settings = options.settings ?? DEFAULT_DIRECTOR_CHAT_SETTINGS;
    const messages = buildInterviewDirectorMessages(session, answer, draft, options.prompt ?? DEFAULT_INTERVIEW_DIRECTOR_PROMPT);
    const model = settings.model ?? DEFAULT_INTERVIEW_CHAT_MODEL;
    const request: ModelRequest = {
      metadata: { moduleId: "interview", purpose: "interview_director", privacy: "confidential", traceId: operationId,
        cacheSessionId: interviewCacheSessionId(session.interview.id, "director"),
        budget: { timeoutMs: INTERVIEW_CHAT_TIMEOUT_MS } },
      model, ...(settings.reasoning === "default" ? {} : { reasoning: settings.reasoning }), messages,
      responseFormat: { type: "json", schemaName: "interview_director_v2", jsonSchema: INTERVIEW_DIRECTOR_SCHEMA },
    };
    const now = new Date().toISOString();
    const kinds = ["system_prompt", "job_description", "resume", "history", "instruction"] as const;
    const trace: InterviewCallTrace = { actor: "director", operationId, status: "failed", startedAt: now, finishedAt: now,
      requestedModel: model, reasoning: settings.reasoning, timeoutMs: INTERVIEW_CHAT_TIMEOUT_MS,
      messages: messages.map((message, index) => ({ kind: kinds[index], role: message.role, content: message.content })),
      attempts: [] };
    try {
      if (settings.model && this.gateway.getAvailableModels) {
        const available = await this.gateway.getAvailableModels();
        const selected = available.find((item) => item.providerId === model.providerId && item.modelId === model.modelId);
        if (!selected) throw new Error("所选导演模型已不可用");
        if (settings.reasoning !== "default" && !selected.reasoningLevels.includes(settings.reasoning)) {
          throw new Error("所选导演模型不支持该思考程度");
        }
      }
      const graph = new StateGraph(DirectorState)
        .addNode("review", async (state) => {
          let result: Awaited<ReturnType<typeof generateInterviewJson<InterviewDirectorDecision>>>;
          try {
            result = await generateInterviewJson({ gateway: this.gateway, request: state.request, trace,
              signal: options.signal,
              ...(!settings.model && model.providerId === DEFAULT_INTERVIEW_CHAT_MODEL.providerId
                ? { fallbackModel: { providerId: "openai", modelId: model.modelId } } : {}),
              parse: parseDecision,
            });
          } catch (error) {
            throw new Error(`导演调用失败：${error instanceof Error ? error.message : String(error)}`);
          }
          return { text: result.response.text, decision: result.value };
        }).addEdge(START, "review").addEdge("review", END).compile();
      const result = await graph.invoke({ request });
      trace.outputText = result.text;
      const decision = result.decision;
      trace.status = "succeeded";
      trace.finishedAt = new Date().toISOString();
      options.onTrace?.(trace);
      return { decision, trace };
    } catch (error) {
      trace.finishedAt = new Date().toISOString();
      trace.error = { code: trace.attempts.at(-1)?.error?.code ?? "director_review_failed",
        message: error instanceof Error ? error.message : String(error) };
      options.onTrace?.(trace);
      throw error;
    }
  }
}
