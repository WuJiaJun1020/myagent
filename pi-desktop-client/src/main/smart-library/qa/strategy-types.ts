import type { ModelGateway, ModelRequest } from "../../../platform/shared/ai/model-gateway";
import type { LibraryBook, LibraryLocalModels, LibraryQaStrategyInfo, LibraryQaTurn, LibraryQaHistory } from "../../../shared/contracts/smart-library";
import type { LibraryIndexPort } from "../indexing/index-service";

/** Strategies own their evidence workflow; the service owns cancellation, streaming and persistence. */
export interface LibraryQaStrategyContext {
  turn: LibraryQaTurn;
  book: LibraryBook;
  signal: AbortSignal;
  indexes: LibraryIndexPort;
  gateway: ModelGateway;
  settings: () => Promise<LibraryLocalModels>;
  loadHistory: () => Promise<LibraryQaHistory>;
  request: (purpose: string, messages: ModelRequest["messages"], output: number) => ModelRequest;
  checkpoint: (persist?: boolean) => Promise<void>;
  answer: (request: ModelRequest) => Promise<void>;
}
export interface LibraryQaStrategy {
  info: LibraryQaStrategyInfo;
  execute(context: LibraryQaStrategyContext): Promise<void>;
}
