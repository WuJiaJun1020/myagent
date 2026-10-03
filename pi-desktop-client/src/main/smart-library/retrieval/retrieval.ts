import type { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { connect } from "@lancedb/lancedb";
import type { LibraryBook, LibraryEvidenceReference, LibraryEvidence, LibraryLocalModels, LibrarySearchRequest, LibrarySearchResult, LibrarySearchHit, LibrarySearchTimings } from "../../../shared/contracts/smart-library";
import { validateLocalModels } from "../local-models";
import { safeBoundary } from "../indexing/chunks";
import { distinct, ftsQuery, fuse, queryTerms, windows } from "./ranking";
import { balancedCandidates, coverageOrder, type QueryRoute } from "./coverage";

import { defaultStrategyProfile, strategyIndexConfig, type LibraryStrategyProfile } from "../../../shared/contracts/library-strategy";

type Job = { book: string; version: string; source: string; state: string; model: string; dimensions: number; revision?: string; profile?: LibraryStrategyProfile; config?: LibraryLocalModels };
type Page = { page: number; chapter: number; start: number; end: number };
type Boundary = { chapter: number; end: number; firstChapter: number; start: number };
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);

export class LibraryRetrieval {
  private active?: { book: string; token: string; controller: AbortController };
  private maps = new Map<string, Page[]>();
  private readers = 0;
  constructor(private db: DatabaseSync, private root: string, private bookRoot = root) {}
  isBusy() { return !!this.active || this.readers > 0; }
  cancel(book: string, token: string) { if (this.active?.book === book && this.active.token === token) this.active.controller.abort(); }
  private job(book: string): Job {
    const row = this.db.prepare("SELECT j.data FROM active a JOIN jobs j ON j.version=a.version AND j.book=a.book WHERE a.book=?").get(book);
    const job: Job | undefined = row && JSON.parse(String(row.data));
    if (!job || job.state !== "ready") throw Error("请先完成本书索引，再查找原文");
    return job;
  }
  // Existing reader pages remain untouched. Match their exact text to canonical chapters.
  private async pages(job: Job, signal?: AbortSignal): Promise<Page[]> {
    const key = `${job.book}:${job.source}`; const cached = this.maps.get(key); if (cached) return cached;
    const book: LibraryBook = JSON.parse(await readFile(join(this.bookRoot, job.book, "book.json"), "utf8"));
    const chapters = this.db.prepare("SELECT chapter FROM chapters WHERE book=? AND source=? ORDER BY chapter").all(job.book, job.source);
    let current = 0, cursor = 0, source = ""; const result: Page[] = [];
    const load = () => String(this.db.prepare("SELECT text FROM chapters WHERE book=? AND source=? AND chapter=?").get(job.book, job.source, chapters[current].chapter)!.text);
    source = load();
    for (let page = 0; page < book.chapters.length; page++) {
      signal?.throwIfAborted();
      const text = await readFile(join(this.bookRoot, job.book, `${page}.txt`), "utf8");
      let start = source.indexOf(text, cursor);
      while (start < 0 && current + 1 < chapters.length) { current++; cursor = 0; source = load(); start = source.indexOf(text); }
      if (!text || start < 0) throw Error("阅读分页与索引原文无法精确对应；暂不能使用阅读范围或跳转，请保留原书并反馈此问题");
      cursor = start + text.length;
      result.push({ page, chapter: Number(chapters[current].chapter), start, end: cursor });
    }
    if (this.maps.size >= 4) this.maps.delete(this.maps.keys().next().value!);
    this.maps.set(key, result); return result;
  }
  private async boundary(job: Job, readingPage?: number, signal?: AbortSignal, readingStartPage?: number): Promise<Boundary> {
    if (readingPage === undefined) {
      const row = this.db.prepare("SELECT chapter FROM chapters WHERE book=? AND source=? ORDER BY chapter DESC LIMIT 1").get(job.book, job.source)!;
      // SQL length counts codepoints, while all stored offsets use UTF-16.
      if(readingStartPage!==undefined)throw Error("起始页必须同时指定结束页");
      return { chapter: Number(row.chapter), end: Number.MAX_SAFE_INTEGER, firstChapter:0,start:0 };
    }
    if (!Number.isInteger(readingPage) || readingPage < 0) throw Error("阅读范围无效");
    const page = (await this.pages(job, signal))[readingPage]; if (!page) throw Error("阅读页不存在");
    if(readingStartPage!==undefined&&(!Number.isInteger(readingStartPage)||readingStartPage<0||readingStartPage>readingPage))throw Error("起止页范围无效");
    const first=(await this.pages(job,signal))[readingStartPage??0];
    return {...page,firstChapter:first.chapter,start:first.start};
  }
  private hit(job: Job, row: any, boundary: Boundary): LibrarySearchHit {
    const end = row.chapter === boundary.chapter ? Math.min(Number(row.end), boundary.end) : Number(row.end);
    const start=row.chapter===boundary.firstChapter?Math.max(Number(row.start),boundary.start):Number(row.start);
    return { id: String(row.id), ordinal: Number(row.ordinal), chapter: Number(row.chapter), title: String(this.db.prepare("SELECT title FROM chapters WHERE book=? AND source=? AND chapter=?").get(job.book, job.source, row.chapter)!.title), start, end, text: String(row.text).slice(start-Number(row.start), end - Number(row.start)) };
  }
  private keyword(job: Job, query: string, boundary: Boundary, limit = 40): LibrarySearchHit[] {
    const match = ftsQuery(query); if (!match) return [];
    const rows = this.db.prepare(`SELECT c.* FROM chunk_terms JOIN chunks c ON c.version=chunk_terms.version AND c.ordinal=chunk_terms.ordinal
      WHERE chunk_terms MATCH ? AND c.version=? AND (c.chapter<? OR (c.chapter=? AND c.end<=?)) AND (c.chapter>? OR (c.chapter=? AND c.start>=?)) ORDER BY bm25(chunk_terms),c.ordinal LIMIT ?`).all(match, job.version, boundary.chapter, boundary.chapter, boundary.end,boundary.firstChapter,boundary.firstChapter,boundary.start, limit);
    // Exact phrases get a separate bounded path, even if BM25's candidate pool is noisy.
    const exactRows = this.db.prepare("SELECT * FROM chunks WHERE version=? AND (chapter<? OR (chapter=? AND end<=?)) AND (chapter>? OR (chapter=? AND start>=?)) AND instr(lower(text),lower(?))>0 ORDER BY ordinal LIMIT ?").all(job.version, boundary.chapter, boundary.chapter, boundary.end,boundary.firstChapter,boundary.firstChapter,boundary.start, query.trim(), limit);
    const hits = [...new Map([...exactRows, ...rows].map(row => [String(row.id), this.hit(job, row, boundary)])).values()];
    // A boundary-crossing chunk is never searched through its future tokens/vector.
    const terms = queryTerms(query);
    for (const row of this.db.prepare("SELECT * FROM chunks WHERE version=? AND ((chapter=? AND start<? AND end>?) OR (chapter=? AND start<? AND end>?)) ORDER BY ordinal").all(job.version, boundary.chapter, boundary.end, boundary.end,boundary.firstChapter,boundary.start,boundary.start)) {
      const hit = this.hit(job, row, boundary);
      if (hit.end>hit.start && terms.some(t => hit.text.normalize("NFKC").toLowerCase().includes(t))) hits.push(hit);
    }
    const exact = query.trim().normalize("NFKC").toLowerCase();
    return hits.sort((a, b) => Number(b.text.normalize("NFKC").toLowerCase().includes(exact)) - Number(a.text.normalize("NFKC").toLowerCase().includes(exact))).slice(0, limit);
  }
  private async post(url: string, body: unknown, signal: AbortSignal): Promise<any> {
    const response = await fetch(url, { method: "POST", redirect: "error", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { await response.body?.cancel(); throw Error(`本地接口 HTTP ${response.status}`); }
    const reader = response.body?.getReader(); if (!reader) throw Error("接口响应为空");
    const buffers: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 4 * 1024 * 1024) { await reader.cancel(); throw Error("接口响应过大"); } buffers.push(value); }
    return JSON.parse(Buffer.concat(buffers).toString("utf8"));
  }
  private async timed<T>(timings: LibrarySearchTimings, key: keyof LibrarySearchTimings, work: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try { return await work(); }
    finally { timings[key] = (timings[key] ?? 0) + performance.now() - started; }
  }
  private async vector(job: Job, query: string, settings: LibraryLocalModels, boundary: Boundary, signal: AbortSignal, timings: LibrarySearchTimings, limit = 40) {
    if (settings.embeddingModel !== job.model) throw Error("当前向量模型与有效索引不同，请恢复建库模型或重建索引");
    const data = await this.timed(timings, "embeddingMs", () => this.post(settings.embeddingUrl, { model: job.model, input: [query], input_type: "query", truncate: false }, signal));
    const vector = data.embeddings?.[0];
    if (data.model !== job.model || (data.model_revision ?? "unreported") !== (job.revision ?? "unreported") || !Array.isArray(vector) || vector.length !== job.dimensions || !vector.every((n: unknown) => typeof n === "number" && Number.isFinite(n)) || !vector.some(n => n !== 0)) throw Error("查询向量的模型、权重版本或维度与索引不一致");
    return this.timed(timings, "vectorMs", async () => {
      const bounds = this.db.prepare("SELECT min(ordinal) first,max(ordinal) n FROM chunks WHERE version=? AND (chapter<? OR (chapter=? AND end<=?)) AND (chapter>? OR (chapter=? AND start>=?))").get(job.version, boundary.chapter, boundary.chapter, boundary.end,boundary.firstChapter,boundary.firstChapter,boundary.start);
      const max=bounds?.n;
      if (max === null || max === undefined) return [];
      const connection = await connect(join(this.root, "vectors", job.version));
      try {
        const table = await connection.openTable("chunks");
        const escape = (s: string) => s.replaceAll("'", "''");
        const rows = await table.vectorSearch(vector).where(`bookId = '${escape(job.book)}' AND version = '${escape(job.version)}' AND sourceVersion = '${escape(job.source)}' AND ordinal >= ${Number(bounds?.first)} AND ordinal <= ${Number(max)}`).distanceType("cosine").limit(limit).select(["id", "ordinal", "_distance"]).toArray();
        signal.throwIfAborted();
        return rows.map(r => {
          const row = this.db.prepare("SELECT * FROM chunks WHERE version=? AND ordinal=? AND id=?").get(job.version, Number(r.ordinal), String(r.id));
          if (!row || Number(row.chapter)<boundary.firstChapter || (Number(row.chapter)===boundary.firstChapter && Number(row.end)<=boundary.start) || Number(row.chapter) > boundary.chapter || (Number(row.chapter) === boundary.chapter && Number(row.end) > boundary.end)) throw Error("向量结果与原文范围不一致");
          return this.hit(job, row, boundary);
        });
      } finally { connection.close(); }
    });
  }
  private async rerank(query: string, hits: LibrarySearchHit[], config: LibraryLocalModels, signal: AbortSignal, warnings: string[], batchSize = 4) {
    const small = config.rerankerModel === "BAAI/bge-reranker-base";
    if (small && query.length > 100) throw Error("BGE Base 的检索问题限 100 字符，请缩短问题或选择千问 / BGE v2 M3");
    const pieces = hits.flatMap((hit, index) => (small ? windows(hit.text) : [hit.text]).map(text => ({ index, text })));
    if (small) warnings.push("BGE Base 使用覆盖全文的短窗口重排；每个片段取最高窗口分数，不与其他模型分数直接比较。");
    const scores = hits.map(() => -Infinity);
    for (let i = 0; i < pieces.length; i += 16) {
      const batch = pieces.slice(i, i + 16);
      const data = await this.post(config.rerankerUrl, { model: config.rerankerModel, query, documents: batch.map(p => p.text), top_n: batch.length, truncate: false, batch_size: batchSize }, signal);
      const rows = data.results;
      if (data.model !== undefined && data.model !== config.rerankerModel) throw Error("重排接口返回了不同的模型");
      if (!Array.isArray(rows) || rows.length !== batch.length || new Set(rows.map(r => r.index)).size !== batch.length || !rows.every(r => Number.isInteger(r.index) && r.index >= 0 && r.index < batch.length && typeof r.relevance_score === "number" && Number.isFinite(r.relevance_score))) throw Error("重排响应缺失、重复或分数无效");
      for (const r of rows) scores[batch[r.index].index] = Math.max(scores[batch[r.index].index], r.relevance_score);
    }
    return hits.map((hit, i) => ({ ...hit, rerankScore: scores[i] })).sort((a, b) => b.rerankScore - a.rerankScore);
  }
  private async plannedSearch(job: Job, input: LibrarySearchRequest, config: LibraryLocalModels, boundary: Boundary, signal: AbortSignal, timings: LibrarySearchTimings, profile: LibraryStrategyProfile, diagnostics: boolean, started: number): Promise<LibrarySearchResult> {
    const queries = [input.query.trim(), ...(input.subqueries ?? [])], options = profile.retrieval;
    const warnings: string[] = [], routes: QueryRoute[] = [];
    // The local GPU service accepts one request at a time; keep routes sequential.
    for (const query of queries) {
      signal.throwIfAborted(); const keywordStarted = performance.now();
      const keyword = input.mode !== "vector" ? this.keyword(job, query, boundary, options.keywordCandidates) : [];
      if (input.mode !== "vector") timings.keywordMs = (timings.keywordMs ?? 0) + performance.now() - keywordStarted;
      let vector: LibrarySearchHit[] = [];
      if (input.mode !== "keyword") try { vector = await this.vector(job, query, config, boundary, signal, timings, options.vectorCandidates); }
      catch (e) { signal.throwIfAborted(); if (input.mode === "vector") throw e; warnings.push(`语义检索不可用，已降级为关键词：${errorText(e)}`); }
      const fusionStarted = performance.now();
      routes.push({ keyword, vector, fused: fuse(keyword, vector, options.rrfK) });
      timings.fusionMs = (timings.fusionMs ?? 0) + performance.now() - fusionStarted;
    }
    const fusionStarted = performance.now();
    const fused = balancedCandidates(routes, options.fusionCandidates, profile.context.deduplicate);
    timings.fusionMs = (timings.fusionMs ?? 0) + performance.now() - fusionStarted;
    let rankedRoutes = queries.map((_, query) => fused.filter(h => h.rerankQuery === query).sort((a, b) => a.queryMatches!.find(m => m.query === query)!.fusionRank - b.queryMatches!.find(m => m.query === query)!.fusionRank));
    let reranked = false;
    if (input.rerank && fused.length) try {
      rankedRoutes = await this.timed(timings, "rerankMs", async () => {
        const result: LibrarySearchHit[][] = [];
        for (const [query, hits] of rankedRoutes.entries()) {
          signal.throwIfAborted(); result.push(hits.length ? await this.rerank(queries[query], hits, config, signal, warnings, options.batchSize) : []);
        }
        return result;
      }); reranked = true;
    } catch (e) { signal.throwIfAborted(); warnings.push(`重排不可用，保留召回排序：${errorText(e)}`); }
    signal.throwIfAborted();
    const ranked = coverageOrder(rankedRoutes, fused.length, false);
    const hits = coverageOrder(rankedRoutes, options.returnedChunks, profile.context.deduplicate), selected = new Set(hits.map(h => h.id));
    const union = (key: "keyword" | "vector") => [...new Map(routes.flatMap(r => r[key]).map(h => [h.id, h])).values()];
    const keyword = union("keyword"), vector = union("vector");
    return { version: job.version, hits, warnings: [...new Set(warnings)], elapsedMs: Date.now() - started, keywordCount: keyword.length, vectorCount: vector.length, reranked, timings,
      plan: { queries, routes: routes.map((route, query) => ({ query, keywordCount: route.keyword.length, vectorCount: route.vector.length })),
        candidates: ranked.map(h => ({ id: h.id, chapter: h.chapter, queryMatches: h.queryMatches!, rerankQuery: h.rerankQuery!, queryRank: h.queryRank, rerankScore: h.rerankScore, selected: selected.has(h.id), reason: selected.has(h.id) ? h.selectionReason! : "返回片段数量上限或高度重叠，未保留" })) },
      ...(diagnostics ? { diagnostics: { keyword, vector, fused, reranked: ranked } } : {}),
    };
  }
  async search(book: string, input: LibrarySearchRequest, inputSettings: LibraryLocalModels, diagnostics = false, profile?: LibraryStrategyProfile): Promise<LibrarySearchResult> {
    if (!input || typeof input.token !== "string" || !/^[\w-]{1,100}$/.test(input.token) || typeof input.query !== "string" || !input.query.trim() || input.query.length > 200 || !["keyword", "vector", "hybrid"].includes(input.mode) || typeof input.rerank !== "boolean") throw Error("检索参数无效，问题限 200 字符");
    if (input.subqueries !== undefined && (!profile?.queryPlanning?.enabled || !Array.isArray(input.subqueries) || input.subqueries.length > profile.queryPlanning.maxSubqueries || !input.subqueries.every(q => typeof q === "string" && q.trim() && q.length <= 200) || new Set([input.query.trim(), ...input.subqueries]).size !== input.subqueries.length + 1)) throw Error("子问题格式、数量或方案配置无效");
    if (this.active) throw Error("已有检索正在运行，请停止或等待完成");
    const controller = new AbortController(); this.active = { book, token: input.token, controller };
    const started = Date.now(); const timer = setTimeout(() => controller.abort(Error("检索超过 90 秒，请缩短问题或检查本地服务")), 90000);
    const signal = controller.signal;
    const timings: LibrarySearchTimings = {};
    try {
      const setupStarted = performance.now();
      const job = this.job(book); const config = validateLocalModels(inputSettings); const boundary = await this.boundary(job, input.readingPage, signal, input.readingStartPage); signal.throwIfAborted();
      timings.setupMs = performance.now() - setupStarted;
      if (profile && strategyIndexConfig(profile) !== strategyIndexConfig(job.profile ?? defaultStrategyProfile(job.config ?? inputSettings))) throw Error("切片或向量配置已变化，请先重建该方案的索引");
      if (profile?.queryPlanning?.enabled) return await this.plannedSearch(job, input, config, boundary, signal, timings, profile, diagnostics, started);
      const options = (profile ?? defaultStrategyProfile()).retrieval;
      const select = (hits: LibrarySearchHit[], limit: number) => profile?.context.deduplicate === false ? hits.slice(0,limit) : distinct(hits,limit);
      const warnings: string[] = []; const query = input.query.trim();
      const keywordStarted = performance.now();
      const keyword = input.mode !== "vector" ? this.keyword(job, query, boundary, options.keywordCandidates) : [];
      if (input.mode !== "vector") timings.keywordMs = performance.now() - keywordStarted;
      let vector: LibrarySearchHit[] = [];
      if (input.mode !== "keyword") try { vector = await this.vector(job, query, config, boundary, signal, timings, options.vectorCandidates); }
      catch (e) { signal.throwIfAborted(); if (input.mode === "vector") throw e; warnings.push(`语义检索不可用，已降级为关键词：${errorText(e)}`); }
      signal.throwIfAborted();
      const fusionStarted = performance.now();
      let hits: LibrarySearchHit[] = select(fuse(keyword, vector, options.rrfK), options.fusionCandidates); let reranked = false;
      timings.fusionMs = performance.now() - fusionStarted;
      const fused = diagnostics ? hits.map(hit=>({...hit})) : [];
      if (input.rerank && hits.length) try { hits = await this.timed(timings, "rerankMs", () => this.rerank(query, hits, config, signal, warnings, options.batchSize)); reranked = true; }
      catch (e) { signal.throwIfAborted(); warnings.push(`重排不可用，保留召回排序：${errorText(e)}`); }
      signal.throwIfAborted();
      return { version: job.version, hits: select(hits, options.returnedChunks), warnings, elapsedMs: Date.now() - started, keywordCount: keyword.length, vectorCount: vector.length, reranked, ...(diagnostics ? { timings, diagnostics: { keyword, vector, fused, reranked:hits } } : {}) };
    } catch (e) {
      if (signal.aborted) throw Error(Date.now() - started >= 90000 ? "检索超时，请检查本地服务或缩短问题" : "检索已停止");
      throw e;
    } finally { clearTimeout(timer); this.active = undefined; }
  }
  async evidence(book: string, reference: LibraryEvidenceReference, options: { locatePage?: boolean; expandChars?: number } = {}): Promise<LibraryEvidence> {
    this.readers++;
    try { return await this.readEvidence(book, reference, options.locatePage !== false, options.expandChars ?? 240); }
    finally { this.readers--; }
  }
  private async readEvidence(book: string, reference: LibraryEvidenceReference, locatePage: boolean, expandChars: number): Promise<LibraryEvidence> {
    const job = this.job(book);
    if (!reference || reference.version !== job.version || !/^[a-f0-9]{64}$/.test(reference.id)) throw Error("检索结果已失效，请重新查找原文");
    const boundary = await this.boundary(job, reference.readingPage, undefined, reference.readingStartPage);
    const row = this.db.prepare("SELECT * FROM chunks WHERE version=? AND id=?").get(job.version, reference.id);
    if (!row || Number(row.chapter)<boundary.firstChapter || (Number(row.chapter)===boundary.firstChapter && Number(row.end)<=boundary.start) || Number(row.chapter) > boundary.chapter || (Number(row.chapter) === boundary.chapter && Number(row.start) >= boundary.end)) throw Error("引用不在本书当前阅读范围内");
    const hit = this.hit(job, row, boundary);
    if (!Number.isInteger(expandChars) || expandChars < 0 || expandChars > 2000) throw Error("原文扩展范围无效");
    if (reference.contextSpan) {
      const { start, end } = reference.contextSpan;
      const length = String(this.db.prepare("SELECT text FROM chapters WHERE book=? AND source=? AND chapter=?").get(book, job.source, hit.chapter)!.text).length;
      if (![start, end].every(Number.isInteger) || start < 0 || end > length || start > hit.start || end < hit.end || end - start > 128000 || (hit.chapter === boundary.firstChapter && start < boundary.start) || (hit.chapter === boundary.chapter && end > boundary.end)) throw Error("合并引用超出原文或阅读范围");
    }
    return this.context(job,hit,boundary,locatePage,expandChars,reference.contextSpan);
  }
  async spanEvidence(book:string,reference:{version:string;source:string;chapter:number;start:number;end:number}):Promise<LibraryEvidence> {
    this.readers++;
    try { return await this.readSpanEvidence(book, reference); }
    finally { this.readers--; }
  }
  private async readSpanEvidence(book:string,reference:{version:string;source:string;chapter:number;start:number;end:number}):Promise<LibraryEvidence> {
    const job=this.job(book);
    // Evaluation coordinates refer to canonical source text, not chunk IDs.
    // They remain valid after rechunking the same source.
    if(!reference||reference.source!==job.source)throw Error("原书已变化，不能定位这份历史报告的证据");
    const {chapter,start,end}=reference;
    if(![chapter,start,end].every(Number.isInteger)||chapter<0||start<0||end<=start)throw Error("引用坐标无效");
    const row=this.db.prepare("SELECT title,text FROM chapters WHERE book=? AND source=? AND chapter=?").get(book,job.source,chapter);
    if(!row||end>String(row.text).length)throw Error("引用超出原文范围");
    const hit:LibrarySearchHit={id:"",ordinal:0,chapter,title:String(row.title),start,end,text:String(row.text).slice(start,end)};
    return this.context(job,hit,await this.boundary(job));
  }
  private async context(job:Job,hit:LibrarySearchHit,boundary:Boundary,locatePage=true,expandChars=240,contextSpan?:{start:number;end:number}):Promise<LibraryEvidence> {
    const book=job.book;
    const source = String(this.db.prepare("SELECT text FROM chapters WHERE book=? AND source=? AND chapter=?").get(book, job.source, hit.chapter)!.text);
    const start = safeBoundary(source, contextSpan?.start ?? Math.max(0, hit.start - expandChars,hit.chapter===boundary.firstChapter?boundary.start:0));
    const end = safeBoundary(source, contextSpan?.end ?? Math.min(source.length, hit.end + expandChars, hit.chapter === boundary.chapter ? boundary.end : Infinity));
    const result: LibraryEvidence = { title: hit.title, text: source.slice(start, end), highlight: { start: hit.start - start, end: hit.end - start } };
    if (!locatePage) return result;
    try {
      const page = (await this.pages(job)).find(p => p.chapter === hit.chapter && p.end > hit.start && p.start < hit.end);
      if (!page) throw Error("未找到对应阅读页");
      result.page = page.page; result.pageHighlight = { start: Math.max(hit.start, page.start) - page.start, end: Math.min(hit.end, page.end) - page.start };
    } catch (e) { result.locationError = errorText(e); }
    return result;
  }
}
