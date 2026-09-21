import type {
  AiCallOptions,
  AiGatewayResult,
  AiModelSelector,
  AiRequestMetadata,
  AiResolvedModel,
  AiUsage,
} from "./contracts";

export type EmbeddingInput = {
  /** Caller-owned stable ID; the gateway must preserve it in the response. */
  id: string;
  text: string;
};

export type EmbeddingRequest = {
  metadata: AiRequestMetadata;
  inputs: readonly EmbeddingInput[];
  model?: AiModelSelector;
  dimensions?: number;
};

export type EmbeddingVector = {
  id: string;
  vector: readonly number[];
};

export type EmbeddingResponse = {
  requestId: string;
  model: AiResolvedModel;
  dimensions: number;
  embeddings: readonly EmbeddingVector[];
  usage: AiUsage;
};

/** Provider-neutral vector generation port. Storage and retrieval are module-owned concerns. */
export interface EmbeddingGateway {
  /** Expected request/provider/cancellation failures are returned, not thrown. */
  embed(request: EmbeddingRequest, options?: AiCallOptions): Promise<AiGatewayResult<EmbeddingResponse>>;
}
