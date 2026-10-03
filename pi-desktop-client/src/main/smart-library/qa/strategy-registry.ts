import { DEFAULT_LIBRARY_QA_STRATEGY } from "../../../shared/contracts/smart-library";
import { standardRag } from "./strategies/standard-rag";
import type { LibraryQaStrategy } from "./strategy-types";

const strategies = new Map<string, LibraryQaStrategy>([standardRag].map(strategy => [strategy.info.id, strategy]));
export function getQaStrategy(id: string = DEFAULT_LIBRARY_QA_STRATEGY): LibraryQaStrategy {
  const strategy = strategies.get(id);
  if (!strategy) throw Error(`回答策略不可用：${id}，请选择可用策略`);
  return strategy;
}
export function listQaStrategies() { return [...strategies.values()].map(strategy => ({ ...strategy.info })); }
