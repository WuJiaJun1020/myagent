import {
  aiFailure,
  assertAiRequestMetadata,
  invalidAiRequest,
  type AiCallOptions,
  type AiGatewayResult,
} from "./contracts";
import type { EmbeddingGateway, EmbeddingRequest, EmbeddingResponse } from "./embedding-gateway";
import type { ModelGateway, ModelRequest, ModelResponse, ModelStreamEvent } from "./model-gateway";

export type ModelGatewayHandler = (
  request: ModelRequest,
  options?: AiCallOptions,
) => Promise<AiGatewayResult<ModelResponse>> | AiGatewayResult<ModelResponse>;

export type ModelStreamHandler = (
  request: ModelRequest,
  options?: AiCallOptions,
) => AsyncIterable<ModelStreamEvent>;

export type EmbeddingGatewayHandler = (
  request: EmbeddingRequest,
  options?: AiCallOptions,
) => Promise<AiGatewayResult<EmbeddingResponse>> | AiGatewayResult<EmbeddingResponse>;

const missingResponse = (capability: string) => aiFailure({
  code: "not_configured",
  message: `No ${capability} test response was configured`,
  retryable: false,
});

/** Recording test double for module tests. It never connects to a provider. */
export class RecordingModelGateway implements ModelGateway {
  readonly generateRequests: ModelRequest[] = [];
  readonly streamRequests: ModelRequest[] = [];

  constructor(
    private readonly generateHandler: ModelGatewayHandler = () => missingResponse("model"),
    private readonly streamHandler?: ModelStreamHandler,
  ) {}

  async generate(request: ModelRequest, options?: AiCallOptions): Promise<AiGatewayResult<ModelResponse>> {
    try {
      assertAiRequestMetadata(request.metadata);
    } catch (error) {
      return invalidAiRequest(error);
    }
    this.generateRequests.push(request);
    return this.generateHandler(request, options);
  }

  async *stream(request: ModelRequest, options?: AiCallOptions): AsyncIterable<ModelStreamEvent> {
    try {
      assertAiRequestMetadata(request.metadata);
    } catch (error) {
      yield { type: "failed", error: invalidAiRequest(error).error };
      return;
    }
    this.streamRequests.push(request);
    if (!this.streamHandler) {
      yield { type: "failed", error: missingResponse("model stream").error };
      return;
    }
    yield* this.streamHandler(request, options);
  }
}

/** Recording test double for embedding/indexing tests. It never connects to a provider. */
export class RecordingEmbeddingGateway implements EmbeddingGateway {
  readonly requests: EmbeddingRequest[] = [];

  constructor(private readonly handler: EmbeddingGatewayHandler = () => missingResponse("embedding")) {}

  async embed(request: EmbeddingRequest, options?: AiCallOptions): Promise<AiGatewayResult<EmbeddingResponse>> {
    try {
      assertAiRequestMetadata(request.metadata);
    } catch (error) {
      return invalidAiRequest(error);
    }
    this.requests.push(request);
    return this.handler(request, options);
  }
}
