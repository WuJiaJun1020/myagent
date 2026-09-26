import type {
  AiCallOptions,
  AiGatewayError,
  AiGatewayResult,
  AiModelSelector,
  AiRequestMetadata,
  AiResolvedModel,
  AiUsage,
} from "./contracts";

export type ModelMessageRole = "system" | "user" | "assistant";

export type ModelMessage = {
  role: ModelMessageRole;
  content: string;
};

export type ModelReasoningLevel = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/** GPT-6's supported reasoning levels here are all non-none and reject sampling overrides. */
export function usesFixedReasoningSampling(model: AiResolvedModel): boolean {
  return (model.providerId === "openai" || model.providerId === "openai-codex")
    && /^gpt-6(?:-|$)/iu.test(model.modelId);
}

export type AiAvailableModel = {
  providerId: string;
  modelId: string;
  name: string;
  reasoningLevels: ModelReasoningLevel[];
  /** Runtime model metadata, not the current conversation's remaining capacity. */
  contextWindowTokens?: number;
  maxOutputTokens?: number;
};

export type ModelResponseFormat =
  | { type: "text" }
  | {
      type: "json";
      /** A diagnostic label only; schema enforcement belongs to the platform adapter. */
      schemaName?: string;
      jsonSchema?: Readonly<Record<string, unknown>>;
    };

export type ModelRequest = {
  metadata: AiRequestMetadata;
  messages: readonly ModelMessage[];
  model?: AiModelSelector;
  responseFormat?: ModelResponseFormat;
  reasoning?: ModelReasoningLevel;
  temperature?: number;
  topP?: number;
  stopSequences?: readonly string[];
};

export type ModelFinishReason = "stop" | "length" | "content_filter" | "cancelled" | "unknown";

export type ModelResponse = {
  requestId: string;
  model: AiResolvedModel;
  text: string;
  /** Provider-visible reasoning text, only when the runtime actually returns it. */
  reasoningText?: string;
  finishReason: ModelFinishReason;
  usage: AiUsage;
};

export type ModelStreamEvent =
  | { type: "started"; requestId: string; model: AiResolvedModel; diagnostics?: {
      effectiveSystemPrompt?: string;
      estimatedInputTokens: number;
      inputTextCharacters?: number;
      modelContextWindowTokens?: number;
      effectiveTimeoutMs?: number;
      maxOutputTokens?: number;
      temperatureApplied: boolean;
      effectiveTemperature?: number;
      reasoning?: ModelReasoningLevel;
      providerMaxRetries?: number;
    } }
  | { type: "reasoning_delta"; delta: string }
  | { type: "text_delta"; delta: string }
  | { type: "usage"; usage: AiUsage }
  | { type: "completed"; response: ModelResponse }
  | { type: "failed"; error: AiGatewayError };

export type ModelResponseDiagnostics = Pick<ModelResponse, "requestId" | "model" | "text" | "finishReason" | "usage"> & {
  providerStopReason: string;
};

export type ModelCallOptions = AiCallOptions & {
  /** Local lifecycle metadata only. No credentials, URLs, prompts or raw errors. */
  onCallDiagnostics?: (diagnostics: ModelCallDiagnostics) => void;
  /** Opt-in local diagnostics, including responses rejected by validation. Never add this text to generic errors. */
  onResponseDiagnostics?: (response: ModelResponseDiagnostics) => void;
};

export type ModelCallPhase = "request_validation" | "settings" | "model_resolution" | "runtime_refresh"
  | "request_preparation" | "runtime_call" | "response_validation";

export type ModelCallDiagnostics = {
  requestId: string;
  model?: AiResolvedModel;
  phase: ModelCallPhase;
  elapsedMs: number;
  timeline: Array<{ phase: ModelCallPhase; elapsedMs: number }>;
  outcome?: "succeeded" | "failed";
  timeoutSource?: "local_deadline" | "upstream";
  /** Whether completeSimple returned a message (including a provider error message). */
  runtimeResponseReceived: boolean;
  totalTimeoutMs?: number;
  runtimeTimeoutMs?: number;
  websocketConnectTimeoutMs?: number;
  providerMaxRetries?: number;
  maxRetryDelayMs?: number;
  estimatedInputTokens?: number;
  inputTextCharacters?: number;
  maxOutputTokens?: number;
};

/**
 * Provider-neutral text generation port shared by product modules.
 *
 * Implementations may select credentials and defaults from platform settings,
 * but must not read or mutate a module's conversation or business database.
 */
export interface ModelGateway {
  /** Inspect the current default route without creating a conversation or sending model input. */
  getConfiguredModel?(): Promise<AiResolvedModel | null>;
  /** Inspect locally available routes without sending model input. */
  getAvailableModels?(): Promise<AiAvailableModel[]>;
  /** Expected request/provider/cancellation failures are returned, not thrown. */
  generate(request: ModelRequest, options?: ModelCallOptions): Promise<AiGatewayResult<ModelResponse>>;
  /** Expected failures terminate the iterator with one `failed` event. */
  stream(request: ModelRequest, options?: AiCallOptions): AsyncIterable<ModelStreamEvent>;
}
