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
  temperature?: number;
  topP?: number;
  stopSequences?: readonly string[];
};

export type ModelFinishReason = "stop" | "length" | "content_filter" | "cancelled" | "unknown";

export type ModelResponse = {
  requestId: string;
  model: AiResolvedModel;
  text: string;
  finishReason: ModelFinishReason;
  usage: AiUsage;
};

export type ModelStreamEvent =
  | { type: "started"; requestId: string; model: AiResolvedModel }
  | { type: "text_delta"; delta: string }
  | { type: "usage"; usage: AiUsage }
  | { type: "completed"; response: ModelResponse }
  | { type: "failed"; error: AiGatewayError };

/**
 * Provider-neutral text generation port shared by product modules.
 *
 * Implementations may select credentials and defaults from platform settings,
 * but must not read or mutate a module's conversation or business database.
 */
export interface ModelGateway {
  /** Expected request/provider/cancellation failures are returned, not thrown. */
  generate(request: ModelRequest, options?: AiCallOptions): Promise<AiGatewayResult<ModelResponse>>;
  /** Expected failures terminate the iterator with one `failed` event. */
  stream(request: ModelRequest, options?: AiCallOptions): AsyncIterable<ModelStreamEvent>;
}
