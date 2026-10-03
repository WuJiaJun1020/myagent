import { performance } from "node:perf_hooks";
import type { AiResolvedModel } from "../../../platform/shared/ai/contracts";
import type { ModelReasoningLevel, ModelRequest } from "../../../platform/shared/ai/model-gateway";
import type { LibraryStrategyProfile } from "../../../shared/contracts/library-strategy";
import type { LibraryQaTurn, LibraryQaDebugCall, LibrarySearchRequest, LibrarySearchResult, LibraryEvidence, LibraryEvidenceReference, LibraryQaCitation } from "../../../shared/contracts/smart-library";
import { historyData } from "./qa-prompts";
import { planQueries } from "./query-planning";
import { coverageContexts } from "./coverage-context";

export type RagPipelineOptions = {
  profile: LibraryStrategyProfile; question: string; token: string; history: LibraryQaTurn[]; model?: AiResolvedModel | null; reasoning?: ModelReasoningLevel;
  signal: AbortSignal; readingPage?: number; readingStartPage?: number; version: string;
  search: (input: LibrarySearchRequest) => Promise<LibrarySearchResult>;
  evidence: (reference: LibraryEvidenceReference, expandChars: number) => Promise<LibraryEvidence>;
  generate: (request: ModelRequest, trace: LibraryQaDebugCall) => Promise<string>;
  phase?: (value: "rewriting" | "retrieving") => Promise<void>;
};
/** Shared by interactive QA and evaluation; no final-answer call in this pipeline. */
export async function runRagEvidence(options: RagPipelineOptions) {
  const { profile, signal } = options;
  let query = options.question;
  const debug: LibraryQaDebugCall[] = [], warnings: string[] = [];
  let rewriteMs = 0;
  let subqueries: string[] | undefined;
  if (profile.queryPlanning?.enabled) {
    const plan = await planQueries(options, debug, warnings); subqueries = plan.subqueries; rewriteMs = plan.elapsedMs;
  } else if (profile.rewrite.mode === "always" || (profile.rewrite.mode === "history" && options.history.length)) {
    await options.phase?.("rewriting"); signal.throwIfAborted();
    const started = performance.now();
    const request: ModelRequest = {
      metadata: { moduleId: "smart-library", purpose: "rewrite_question", privacy: "internal", traceId: options.token, budget: { timeoutMs: 45000, maxInputTokens: 24000, maxOutputTokens: 1024 } },
      model: profile.rewrite.model ?? options.model ?? undefined, reasoning: profile.rewrite.reasoning ?? options.reasoning,
      messages: [{ role: "system", content: profile.rewrite.prompt }, { role: "user", content: JSON.stringify({ question: options.question, historyForPronounsOnly: historyData(options.history) }) }],
      responseFormat: { type: "json", schemaName: "library-query", jsonSchema: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 200 } }, required: ["query"], additionalProperties: false } },
    };
    const trace: LibraryQaDebugCall = { purpose: "追问改写", request: structuredClone(request) }; debug.push(trace);
    try {
      trace.response = await options.generate(request, trace); signal.throwIfAborted();
      const parsed = JSON.parse(trace.response);
      if (typeof parsed.query !== "string" || !parsed.query.trim() || parsed.query.length > 200) throw Error("追问改写无效");
      query = parsed.query.trim();
    } catch (e) { signal.throwIfAborted(); trace.error = e instanceof Error ? e.message : "问题改写失败"; warnings.push("追问改写失败或无效，已使用原问题检索；可补充人物或事件名称。"); }
    finally { rewriteMs = performance.now() - started; }
  }
  await options.phase?.("retrieving"); signal.throwIfAborted();
  const search = await options.search({ token: options.token, query, ...(subqueries ? { subqueries } : {}), mode: profile.retrieval.mode, rerank: profile.retrieval.rerank, readingPage: options.readingPage, readingStartPage: options.readingStartPage, profileId: profile.id });
  signal.throwIfAborted(); if (search.version !== options.version) throw Error("索引已更新，请重新执行");
  warnings.push(...search.warnings);
  const citations: LibraryQaCitation[] = [];
  const started = performance.now(); let characters = 0;
  if (profile.queryPlanning?.enabled) {
    const citations = await coverageContexts(options, search, warnings);
    return { query, search, citations, debug, warnings, rewriteMs, contextMs: performance.now() - started };
  }
  for (const hit of search.hits.slice(0, profile.context.chunks)) {
    signal.throwIfAborted();
    const reference: LibraryEvidenceReference = { version: search.version, id: hit.id, profileId: profile.id, readingPage: options.readingPage, readingStartPage: options.readingStartPage };
    const excerpt = await options.evidence(reference, profile.context.expandChars);
    if (excerpt.text.slice(excerpt.highlight.start, excerpt.highlight.end) !== hit.text) throw Error("上下文与检索片段不一致");
    if (characters + excerpt.text.length > profile.context.maxChars) { warnings.push("原文上下文达到该方案的字符预算，后续片段未加入。"); break; }
    characters += excerpt.text.length;
    citations.push({ number: citations.length + 1, reference, excerpt });
  }
  return { query, search, citations, debug, warnings, rewriteMs, contextMs: performance.now() - started };
}
