import { performance } from "node:perf_hooks";
import type { RagPipelineOptions } from "./rag-pipeline";
import type { LibraryQaDebugCall } from "../../../shared/contracts/smart-library";
import type { ModelRequest } from "../../../platform/shared/ai/model-gateway";
import { historyData } from "./qa-prompts";

export const queryKey = (text: string) => text.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
export async function planQueries(options: RagPipelineOptions, debug: LibraryQaDebugCall[], warnings: string[]) {
  const config = options.profile.queryPlanning!;
  const started = performance.now();
  await options.phase?.("rewriting"); options.signal.throwIfAborted();
  const request: ModelRequest = {
    metadata: { moduleId: "smart-library", purpose: "plan_book_retrieval", privacy: "internal", traceId: options.token, budget: { timeoutMs: 45000, maxInputTokens: 24000, maxOutputTokens: 1536 } },
    model: options.profile.rewrite.model ?? options.model ?? undefined, reasoning: options.profile.rewrite.reasoning ?? options.reasoning,
    messages: [{ role: "system", content: config.prompt }, { role: "user", content: JSON.stringify({ question: options.question, maxSubqueries: config.maxSubqueries, historyForPronounsOnly: historyData(options.history) }) }],
    responseFormat: { type: "json", schemaName: "library-retrieval-plan", jsonSchema: { type: "object", properties: { subqueries: { type: "array", maxItems: config.maxSubqueries, items: { type: "string", minLength: 1, maxLength: 200 } } }, required: ["subqueries"], additionalProperties: false } },
  };
  const trace: LibraryQaDebugCall = { purpose: "检索规划", request: structuredClone(request) }; debug.push(trace);
  let subqueries: string[] = [];
  try {
    trace.response = await options.generate(request, trace); options.signal.throwIfAborted();
    const parsed = JSON.parse(trace.response);
    if (!Array.isArray(parsed.subqueries) || parsed.subqueries.length > config.maxSubqueries || !parsed.subqueries.every((q: unknown) => typeof q === "string" && q.trim() && q.length <= 200)) throw Error("子问题格式或数量无效");
    const seen = new Set([queryKey(options.question)]);
    subqueries = parsed.subqueries.map((q: string) => q.trim()).filter((q: string) => { const key = queryKey(q); if (seen.has(key)) return false; seen.add(key); return true; });
  } catch (e) {
    options.signal.throwIfAborted(); trace.error = e instanceof Error ? e.message : "检索规划失败";
    warnings.push(`检索规划失败，已回退单查询：${trace.error}`);
  }
  return { subqueries, elapsedMs: performance.now() - started };
}
