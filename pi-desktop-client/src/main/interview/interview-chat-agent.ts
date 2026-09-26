import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { InterviewCallTrace, InterviewChatPrompts, InterviewQuestionType, InterviewSession } from "../../shared/contracts/interview";
import { DEFAULT_INTERVIEW_CHAT_MODEL, DEFAULT_INTERVIEW_CHAT_SETTINGS, type InterviewChatSettings } from "../../shared/contracts/interview";
import { DEFAULT_CANDIDATE_CHAT_SETTINGS } from "../../shared/contracts/interview";
import { buildInterviewCandidateMessages, DEFAULT_INTERVIEW_CANDIDATE_PROMPT } from "../../shared/interview-candidate-prompt";
import {
  buildInterviewChatMessages,
  INTERVIEW_CHAT_TIMEOUT_MS,
} from "../../shared/interview-chat-prompt";
import type { ModelGateway, ModelRequest } from "../../platform/shared/ai/model-gateway";
import { candidateResponseModeInstruction, type CandidateResponseMode } from "./candidate-response-mode";
import { CANDIDATE_ANSWER_SCHEMA, parseCandidateAnswer, type CandidateAnswerPayload } from "./candidate-response-output";
import { generateInterviewJson } from "./interview-json-agent-retry";
import { interviewCacheSessionId } from "./interview-cache-session";
import { INTERVIEWER_MESSAGE_SCHEMA, parseInterviewerMessage, type InterviewerMessagePayload } from "./interview-output-schema";

type InterviewChatOptions = { settings?: InterviewChatSettings; prompts?: InterviewChatPrompts;
  additionalControl?: string;
  signal?: AbortSignal; onTrace?: (trace: InterviewCallTrace) => void };

const InterviewGraphState = Annotation.Root({
  request: Annotation<ModelRequest>(),
  reply: Annotation<InterviewerMessagePayload>(),
});
const CandidateGraphState = Annotation.Root({ request: Annotation<ModelRequest>(), answer: Annotation<CandidateAnswerPayload>() });

function request(session: InterviewSession, content: string | undefined, operationId: string,
  settings: InterviewChatSettings, prompts?: InterviewChatPrompts, additionalControl?: string): ModelRequest {
  return {
    metadata: { moduleId: "interview", purpose: "interview_chat", privacy: "confidential", traceId: operationId,
      cacheSessionId: interviewCacheSessionId(session.interview.id, "interviewer"),
      budget: { timeoutMs: INTERVIEW_CHAT_TIMEOUT_MS } },
    model: settings.model ?? DEFAULT_INTERVIEW_CHAT_MODEL,
    ...(settings.reasoning === "default" ? {} : { reasoning: settings.reasoning }),
    messages: buildInterviewChatMessages(session, content, prompts, additionalControl),
    responseFormat: { type: "json", schemaName: "interview_message_v2", jsonSchema: INTERVIEWER_MESSAGE_SCHEMA },
  };
}

export class InterviewChatAgent {
  constructor(private readonly gateway: ModelGateway) {}

  async respond(session: InterviewSession, content: string | undefined, operationId: string,
    options: InterviewChatOptions = {}): Promise<{ text: string; questionType: InterviewQuestionType;
      trace: InterviewCallTrace }> {
    const settings = options.settings ?? DEFAULT_INTERVIEW_CHAT_SETTINGS;
    const modelRequest = request(session, content, operationId, settings, options.prompts, options.additionalControl);
    const hasJobDescription = session.interview.documents.some((document) =>
      document.kind === "job_description" && document.content.trim());
    const resumeIndex = hasJobDescription ? 2 : 1;
    const candidateMessageIndex = content === undefined ? -1 : modelRequest.messages.length - 1
      - (session.interview.directorEnabled ? 1 : 0) - (options.additionalControl ? 1 : 0);
    const topicControlIndex = session.interview.directorEnabled ? modelRequest.messages.length - 1
      - (options.additionalControl ? 1 : 0) : -1;
    const now = new Date().toISOString();
    const trace: InterviewCallTrace = {
      actor: "interviewer", operationId, status: "failed", startedAt: now, finishedAt: now,
      requestedModel: settings.model ?? DEFAULT_INTERVIEW_CHAT_MODEL, reasoning: settings.reasoning,
      timeoutMs: INTERVIEW_CHAT_TIMEOUT_MS,
      messages: modelRequest.messages.map((message, index) => ({
        kind: index === 0 ? "system_prompt" : hasJobDescription && index === 1 ? "job_description"
          : index === resumeIndex ? "resume"
          : index === candidateMessageIndex ? "candidate_message" : index === topicControlIndex ? "topic_control"
            : options.additionalControl && index === modelRequest.messages.length - 1 ? "instruction" : "history",
        role: message.role, content: message.content,
      })),
      attempts: [],
    };
    try {
      await this.validateSettings(settings);
      const graph = new StateGraph(InterviewGraphState)
        .addNode("answer", async (state) => ({ reply: await this.call(state.request, options.signal, trace, !settings.model) }))
        .addEdge(START, "answer")
        .addEdge("answer", END)
        .compile();
      // The database owns durable history; this graph handles one exchange only.
      const result = await graph.invoke({ request: modelRequest });
      if (!result.reply?.message.trim()) throw new Error("面试模型没有返回可显示的内容");
      trace.status = "succeeded";
      trace.finishedAt = new Date().toISOString();
      options.onTrace?.(trace);
      return { text: result.reply.message, questionType: result.reply.questionType, trace };
    } catch (error) {
      trace.finishedAt = new Date().toISOString();
      trace.error = { code: trace.attempts.at(-1)?.error?.code ?? "interview_chat_failed",
        message: error instanceof Error ? error.message : String(error) };
      options.onTrace?.(trace);
      throw error;
    }
  }

  async respondAsCandidate(session: InterviewSession, operationId: string, options: {
    settings?: InterviewChatSettings; prompt?: string; decision: CandidateResponseMode; signal?: AbortSignal;
    onTrace?: (trace: InterviewCallTrace) => void;
  }): Promise<{ text: string; report: CandidateAnswerPayload; trace: InterviewCallTrace }> {
    const settings = options.settings ?? DEFAULT_CANDIDATE_CHAT_SETTINGS;
    const messages = buildInterviewCandidateMessages(session, options.prompt ?? DEFAULT_INTERVIEW_CANDIDATE_PROMPT,
      candidateResponseModeInstruction(options.decision));
    const modelRequest: ModelRequest = {
      metadata: { moduleId: "interview", purpose: "candidate_simulation", privacy: "confidential",
        traceId: operationId, cacheSessionId: interviewCacheSessionId(session.interview.id, "candidate"),
        budget: { timeoutMs: INTERVIEW_CHAT_TIMEOUT_MS } },
      model: settings.model ?? DEFAULT_INTERVIEW_CHAT_MODEL,
      ...(settings.reasoning === "default" ? {} : { reasoning: settings.reasoning }),
      messages, responseFormat: { type: "json", schemaName: "interview_candidate_answer_v1", jsonSchema: CANDIDATE_ANSWER_SCHEMA },
    };
    const now = new Date().toISOString();
    const trace: InterviewCallTrace = {
      actor: "candidate", operationId, status: "failed", startedAt: now, finishedAt: now,
      requestedModel: settings.model ?? DEFAULT_INTERVIEW_CHAT_MODEL, reasoning: settings.reasoning,
      timeoutMs: INTERVIEW_CHAT_TIMEOUT_MS,
      messages: messages.map((message, index) => ({ kind: index === 0 ? "system_prompt"
        : index === 1 ? "job_description" : index === 2 ? "resume"
          : index === messages.length - 1 ? "candidate_control" : "history",
      role: message.role, content: message.content })),
      attempts: [],
    };
    try {
      await this.validateSettings(settings);
      const graph = new StateGraph(CandidateGraphState)
        .addNode("generate_candidate", async (state) => {
          const result = await generateInterviewJson({ gateway: this.gateway, request: state.request, trace,
            parse: (text) => parseCandidateAnswer(text, options.decision), signal: options.signal,
            ...(!settings.model && state.request.model?.providerId === DEFAULT_INTERVIEW_CHAT_MODEL.providerId
              ? { fallbackModel: { providerId: "openai", modelId: DEFAULT_INTERVIEW_CHAT_MODEL.modelId } } : {}),
          });
          return { answer: result.value };
        })
        .addEdge(START, "generate_candidate")
        .addEdge("generate_candidate", END)
        .compile();
      const result = await graph.invoke({ request: modelRequest });
      const answer = result.answer!;
      trace.status = "succeeded";
      trace.finishedAt = new Date().toISOString();
      trace.candidateOutcome = { requestedMode: options.decision.mode, mistakeMade: answer.mistakeMade,
        mistakeKind: answer.mistakeKind, mistakeQuote: answer.mistakeQuote };
      options.onTrace?.(trace);
      return { text: answer.answer, report: answer, trace };
    } catch (error) {
      trace.finishedAt = new Date().toISOString();
      trace.error = { code: trace.attempts.at(-1)?.error?.code ?? "candidate_simulation_failed",
        message: error instanceof Error ? error.message : String(error) };
      options.onTrace?.(trace);
      throw error;
    }
  }

  private async validateSettings(settings: InterviewChatSettings): Promise<void> {
    if (!settings.model || !this.gateway.getAvailableModels) return;
    const available = await this.gateway.getAvailableModels();
    const selected = available.find((model) => model.providerId === settings.model?.providerId
      && model.modelId === settings.model.modelId);
    if (!selected) throw new Error("所选面试模型已不可用，请重新选择");
    if (settings.reasoning !== "default" && !selected.reasoningLevels.includes(settings.reasoning)) {
      throw new Error("所选模型不支持该思考程度，请重新选择");
    }
  }

  private async call(input: ModelRequest, signal: AbortSignal | undefined, trace: InterviewCallTrace,
    allowDefaultFallback: boolean): Promise<InterviewerMessagePayload> {
    const result = await generateInterviewJson({ gateway: this.gateway, request: input, trace, signal,
      parse: parseInterviewerMessage,
      ...(allowDefaultFallback && input.model?.providerId === DEFAULT_INTERVIEW_CHAT_MODEL.providerId
        && input.model.modelId === DEFAULT_INTERVIEW_CHAT_MODEL.modelId
        ? { fallbackModel: { providerId: "openai", modelId: DEFAULT_INTERVIEW_CHAT_MODEL.modelId } } : {}),
    });
    return result.value;
  }
}
