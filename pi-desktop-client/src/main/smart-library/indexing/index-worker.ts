import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, copyFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { connect } from "@lancedb/lancedb";
import { parseBook } from "../book-parser";
import { LibraryRetrieval } from "../retrieval/retrieval";
import { LibraryQaStorage } from "../qa/qa-storage";
import { validateLocalModels } from "../local-models";
import { CHUNK_VERSION, SOURCE_VERSION, hashText, keywords, paragraphs, sourceHash, splitChapter } from "./chunks";
import { MODEL_BATCH_SIZE, VectorWriteBuffer } from "./vector-buffer";
import { optimizeVectorStorage, VectorStorageIntegrityError, type VectorStorageReport } from "./vector-storage";
import { pruneBookIndexRows, pruneUnreferencedVectorDirectories, reclaimSqliteSpace } from "./index-retention";
import type { LibraryIndexStatus, LibraryLocalModels } from "../../../shared/contracts/smart-library";
import type { IndexRequest } from "./worker-contract";
import { defaultStrategyProfile, strategyIndexConfig, type LibraryStrategyProfile } from "../../../shared/contracts/library-strategy";
import { validateStrategyProfile } from "../strategies/profile-store";

type Job = LibraryIndexStatus & { version: string; book: string; source: string; config: LibraryLocalModels; profile?: LibraryStrategyProfile; fingerprint: string; revision?: string; storage?: VectorStorageReport; storageWarning?: string };
const root: string = workerData.root;
const bookRoot: string = workerData.bookRoot ?? root;
let db: DatabaseSync;
let retrieval: LibraryRetrieval;
let qa: LibraryQaStorage;
let busy = "";
let cancelled = false;
let finalizing = false;
let controller: AbortController | undefined;
const ready = (async () => {
  await mkdir(root, { recursive: true });
  db = new DatabaseSync(join(root, "indexes.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS jobs(version TEXT PRIMARY KEY, book TEXT NOT NULL, created INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS active(book TEXT PRIMARY KEY, version TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chapters(book TEXT, source TEXT, chapter INTEGER, title TEXT, text TEXT, PRIMARY KEY(book,source,chapter));
    CREATE TABLE IF NOT EXISTS paragraphs(book TEXT, source TEXT, id TEXT, chapter INTEGER, start INTEGER, end INTEGER, PRIMARY KEY(book,source,id));
    CREATE TABLE IF NOT EXISTS chunks(version TEXT, ordinal INTEGER, id TEXT, chapter INTEGER, paragraphId TEXT, start INTEGER, end INTEGER, text TEXT, hash TEXT, PRIMARY KEY(version,ordinal));
    CREATE INDEX IF NOT EXISTS chunks_chapter ON chunks(version,chapter,ordinal);
    CREATE VIRTUAL TABLE IF NOT EXISTS chunk_terms USING fts5(version UNINDEXED, ordinal UNINDEXED, tokens);`);
  for (const row of db.prepare("SELECT data FROM jobs").all()) {
    const job: Job = JSON.parse(String(row.data));
    if (job.state === "running") { job.state = "paused"; job.error = "上次索引已中断，可从已保存批次继续"; save(job); }
  }
  retrieval = new LibraryRetrieval(db, root, bookRoot);
  qa = new LibraryQaStorage(db);
})();
function save(job: Job) { job.updatedAt = Date.now(); db.prepare("UPDATE jobs SET data=? WHERE version=?").run(JSON.stringify(job), job.version); }
function latest(book: string): Job | undefined { const row = db.prepare("SELECT data FROM jobs WHERE book=? ORDER BY created DESC,rowid DESC LIMIT 1").get(book); return row ? JSON.parse(String(row.data)) : undefined; }
function status(book: string, profile?: LibraryStrategyProfile): LibraryIndexStatus {
  const job = latest(book); const active = db.prepare("SELECT version FROM active WHERE book=?").get(book);
  if (!job) return { state: "empty", total: 0, completed: 0, chapters: 0 };
  const { state, version, total, completed, chapters, model, dimensions, error, updatedAt } = job;
  const effective:Job = active ? JSON.parse(String(db.prepare("SELECT data FROM jobs WHERE version=?").get(active.version)!.data)) : job;
  const stale = !!profile && strategyIndexConfig(effective.profile ?? defaultStrategyProfile(effective.config)) !== strategyIndexConfig(profile);
  return { state, version, total, completed, chapters, model, dimensions, error, updatedAt, stale, storageBytes:effective.storage?.afterBytes, activeVersion: active ? String(active.version) : undefined };
}
const fingerprint = (config: LibraryLocalModels, source: string, profile?: LibraryStrategyProfile) => hashText(JSON.stringify([config.embeddingUrl, config.embeddingModel, source, SOURCE_VERSION, profile ? profile.chunking : CHUNK_VERSION]));
async function prepare(book: string, input: LibraryLocalModels, force: boolean, profile?: LibraryStrategyProfile) {
  if (busy) throw Error("已有图书任务正在运行，请先暂停或等待完成");
  busy = book;
  try {
    const config = validateLocalModels(input);
    const directory = join(bookRoot, book);
    const metadata = JSON.parse(await readFile(join(directory, "book.json"), "utf8"));
    if (!["txt", "epub"].includes(metadata.format)) throw Error("图书格式无效");
    const original = join(directory, `original.${metadata.format}`);
    const bytes = await readFile(original);
    // Original files are immutable inputs; detect accidental replacement before indexing.
    const { createHash } = await import("node:crypto");
    if (createHash("sha256").update(bytes).digest("hex") !== book) throw Error("原始图书校验失败，请重新导入；旧索引保留");
    const parsed = await parseBook(bytes, original, false);
    const source = sourceHash(parsed);
    const prior = latest(book);
    if (!force && prior?.source === source && strategyIndexConfig(prior.profile ?? defaultStrategyProfile(prior.config)) === strategyIndexConfig(profile ?? defaultStrategyProfile(config))) return status(book, profile);
    try { await copyFile(join(directory, "book.json"), join(directory, "book.before-index.json"), constants.COPYFILE_EXCL); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
    const job: Job = { book, version: randomUUID(), source, config, profile, fingerprint: fingerprint(config, source, profile), state: "prepared", chapters: parsed.chapters.length, total: 0, completed: 0, model: config.embeddingModel };
    let removed: string[] = [];
    db.exec("BEGIN IMMEDIATE");
    try {
      const chapterInsert = db.prepare("INSERT OR IGNORE INTO chapters VALUES(?,?,?,?,?)");
      const paragraphInsert = db.prepare("INSERT OR IGNORE INTO paragraphs VALUES(?,?,?,?,?,?)");
      const chunkInsert = db.prepare("INSERT INTO chunks VALUES(?,?,?,?,?,?,?,?,?)");
      const termInsert = db.prepare("INSERT INTO chunk_terms VALUES(?,?,?)");
      for (const [i, chapter] of parsed.chapters.entries()) {
        chapterInsert.run(book, source, i, chapter.title, chapter.text);
        const ranges = paragraphs(chapter.text);
        ranges.forEach((p, n) => paragraphInsert.run(book, source, `${i}:${n}`, i, p.start, p.end));
        let paragraph = 0;
        for (const chunk of splitChapter(chapter.text, profile?.chunking)) {
          while (paragraph + 1 < ranges.length && ranges[paragraph + 1].start <= chunk.start) paragraph++;
          const id = hashText(`${book}:${source}:${CHUNK_VERSION}:${i}:${chunk.start}:${chunk.end}`);
          chunkInsert.run(job.version, job.total, id, i, `${i}:${paragraph}`, chunk.start, chunk.end, chunk.text, hashText(chunk.text));
          termInsert.run(job.version, job.total, keywords(chunk.text)); job.total++;
        }
      }
      db.prepare("INSERT INTO jobs VALUES(?,?,?,?)").run(job.version, book, Date.now(), JSON.stringify(job));
      const active = db.prepare("SELECT version FROM active WHERE book=?").get(book);
      removed = pruneBookIndexRows(db, book, [job.version, ...(active ? [String(active.version)] : [])]);
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
    try {
      await pruneUnreferencedVectorDirectories(db, root);
      if (removed.length) reclaimSqliteSpace(db);
    } catch (error) { job.error = `旧索引清理未完成：${error instanceof Error ? error.message : String(error)}`; save(job); }
    return status(book, profile);
  } finally { busy = ""; }
}
async function vectors(job: Job, texts: string[]) {
  controller = new AbortController();
  const timer = setTimeout(() => controller?.abort(), 90000);
  try {
    const response = await fetch(job.config.embeddingUrl, { method: "POST", redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: job.model, input: texts, input_type: "document", truncate: false }) });
    if (!response.ok) { await response.body?.cancel(); throw Error(`向量接口 HTTP ${response.status}；请检查本地模型服务，超限文本不会被截断`); }
    const reader = response.body?.getReader(); if (!reader) throw Error("向量接口响应为空");
    const buffers: Uint8Array[] = []; let size = 0;
    for (;;) { const r = await reader.read(); if (r.done) break; size += r.value.length; if (size > 4 * 1024 * 1024) { await reader.cancel(); throw Error("向量响应过大"); } buffers.push(r.value); }
    const data = JSON.parse(Buffer.concat(buffers).toString("utf8"));
    const value = data.embeddings; const dimensions = value?.[0]?.length;
    if (data.model !== job.model || !Array.isArray(value) || value.length !== texts.length || !Number.isInteger(dimensions) || dimensions < 1 || dimensions > 32768
      || !value.every((v: any) => Array.isArray(v) && v.length === dimensions && v.every((n: any) => typeof n === "number" && Number.isFinite(n)) && v.some((n: number) => n !== 0))) throw Error("向量响应格式、模型或维度无效");
    const revision = typeof data.model_revision === "string" ? data.model_revision : "unreported";
    if (job.dimensions && (dimensions !== job.dimensions || revision !== job.revision)) throw Error("向量维度或权重版本发生变化，请重建索引，不能混用");
    job.dimensions = dimensions; job.revision = revision;
    return value as number[][];
  } finally { clearTimeout(timer); controller = undefined; }
}
async function run(job: Job) {
  let connection: Awaited<ReturnType<typeof connect>> | undefined;
  type VectorRecord = { id: string; ordinal: number; bookId: string; version: string; sourceVersion: string; chapter: number; vector: number[] };
  let buffer: VectorWriteBuffer<VectorRecord> | undefined;
  try {
    connection = await connect(join(root, "vectors", job.version));
    let table = (await connection.tableNames()).includes("chunks") ? await connection.openTable("chunks") : undefined;
    if (job.completed && !table) throw Error("已保存向量文件缺失，请重建索引");
    // Lance writes precede SQLite checkpoints. Remove an uncheckpointed tail after a crash.
    if (table) {
      const persisted = await table.countRows();
      if (persisted > job.completed) await table.delete(`ordinal >= ${job.completed}`);
      if (await table.countRows() !== job.completed) throw Error("已保存向量数量不一致，请重建索引");
    }
    buffer = new VectorWriteBuffer(async records => {
      if (table) await table.add(records); else table = await connection!.createTable("chunks", records);
      job.completed += records.length; save(job);
    });
    let cursor = job.completed;
    while (cursor < job.total && !cancelled) {
      const chunks = db.prepare("SELECT * FROM chunks WHERE version=? AND ordinal>=? ORDER BY ordinal LIMIT ?").all(job.version, cursor, MODEL_BATCH_SIZE);
      const embedding = await vectors(job, chunks.map(c => String(c.text)));
      if (cancelled) break;
      const records = chunks.map((c, i) => ({ id: String(c.id), ordinal: Number(c.ordinal), bookId: job.book, version: job.version, sourceVersion: job.source, chapter: Number(c.chapter), vector: embedding[i] }));
      await buffer.add(records); cursor += records.length;
    }
    await buffer.flush();
    if (cancelled) { job.state = "paused"; job.error = "已暂停，可继续；当前未保存批次会重新计算"; save(job); return; }
    // The table may have been created by the first buffer flush.
    table?.close(); table = await connection.openTable("chunks");
    if (await table.countRows() !== job.total) throw Error("向量索引完整性检查失败，旧索引保留");
    const actual = await table.query().select(["id", "ordinal"]).toArray();
    const expected = new Map(db.prepare("SELECT ordinal,id FROM chunks WHERE version=?").all(job.version).map(c => [Number(c.ordinal), String(c.id)]));
    for (const row of actual) { if (expected.get(Number(row.ordinal)) !== row.id) throw Error("向量片段标识不一致，旧索引保留"); expected.delete(Number(row.ordinal)); }
    if (expected.size) throw Error("向量片段存在遗漏，旧索引保留");
    const count = db.prepare("SELECT count(*) n FROM chunk_terms WHERE version=?").get(job.version);
    if (Number(count?.n) !== job.total) throw Error("关键词索引完整性检查失败");
    // All persisted chunks must exactly reconstruct from the immutable canonical source.
    for (const chapter of db.prepare("SELECT chapter,text FROM chapters WHERE book=? AND source=?").all(job.book, job.source)) {
      const text = String(chapter.text); let covered = 0;
      for (const c of db.prepare("SELECT start,end,text,hash FROM chunks WHERE version=? AND chapter=? ORDER BY ordinal").all(job.version, chapter.chapter)) {
        if (Number(c.start) > covered || text.slice(Number(c.start), Number(c.end)) !== c.text || hashText(String(c.text)) !== c.hash) throw Error("原文定位或覆盖校验失败");
        covered = Math.max(covered, Number(c.end));
      }
      if (covered !== text.length) throw Error("章节正文未完整覆盖");
    }
    table.close(); connection.close(); connection = undefined;
    try { job.storage = await optimizeVectorStorage(join(root, "vectors", job.version), job.total, { exclusive: true }); job.storageWarning = undefined; }
    catch (error) {
      if (error instanceof VectorStorageIntegrityError) throw error;
      job.storageWarning = `索引可用，但文件整理未完成：${error instanceof Error ? error.message : String(error)}`;
    }
    // Drain old readers before swapping and deleting the old active index.
    finalizing = true;
    while (retrieval.isBusy()) await new Promise(resolve => setTimeout(resolve, 25));
    let removed: string[] = [];
    db.exec("BEGIN IMMEDIATE");
    try {
      job.state = "ready"; job.error = job.storageWarning; save(job);
      db.prepare("INSERT INTO active VALUES(?,?) ON CONFLICT(book) DO UPDATE SET version=excluded.version").run(job.book, job.version);
      removed = pruneBookIndexRows(db, job.book, [job.version]);
      db.exec("COMMIT");
    }
    catch (e) { db.exec("ROLLBACK"); throw e; }
    try {
      await pruneUnreferencedVectorDirectories(db, root);
      if (removed.length) reclaimSqliteSpace(db);
    } catch (error) { job.error = `索引可用，但旧文件清理未完成：${error instanceof Error ? error.message : String(error)}`; save(job); }
  } catch (e) {
    // Save successfully embedded rows on pause/model failure. A failed append
    // is not retried until a restart reconciles the uncheckpointed tail.
    try { await buffer?.flush(); } catch { /* The original failure remains actionable. */ }
    job.state = cancelled ? "paused" : "failed";
    job.error = cancelled ? "已暂停，可从保存进度继续" : `索引未完成：${e instanceof Error ? e.message : String(e)}。检查本地服务后可继续；原书及旧索引保留。`;
    save(job);
  } finally { try { connection?.close(); } finally { busy = ""; finalizing = false; controller = undefined; } }
}
async function handle(message: IndexRequest) {
  const { book, action, settings, ordinal, payload } = message;
  const profile = message.profile ? validateStrategyProfile(message.profile) : undefined;
  await ready;
  if (action === "busy") return !!busy || retrieval.isBusy();
  if (finalizing && ["search", "evidence", "context-evidence", "evaluation-evidence", "chunk", "prepare", "rebuild", "start"].includes(action)) throw Error("索引正在完成切换与清理，请稍候再试");
  if (typeof book !== "string" || !/^[a-f0-9]{64}$/.test(book)) throw Error("图书 ID 无效");
  if (["qa-sessions", "qa-list", "qa-get", "qa-save"].includes(action)) return qa.handle(book, action, payload);
  if (action === "search") return retrieval.search(book, payload, settings, !!profile, profile);
  if (action === "cancel-search") return retrieval.cancel(book, payload);
  if (action === "evidence") return retrieval.evidence(book, payload);
  if (action === "context-evidence") return retrieval.evidence(book, payload.reference, { locatePage: false, expandChars: payload.expandChars });
  if (action === "evaluation-evidence") return retrieval.spanEvidence(book, payload);
  if (action === "status") return status(book, profile);
  if (action === "prepare" || action === "rebuild") return prepare(book, settings, action === "rebuild", profile);
  if (action === "chunk") {
    if (!Number.isInteger(ordinal) || ordinal < 0) throw Error("片段编号无效");
    const job = latest(book); if (!job) return null;
    const c = db.prepare("SELECT * FROM chunks WHERE version=? AND ordinal=?").get(job.version, ordinal); if (!c) return null;
    const title = db.prepare("SELECT title FROM chapters WHERE book=? AND source=? AND chapter=?").get(book, job.source, c.chapter)?.title;
    const neighbour = (n: number) => db.prepare("SELECT id FROM chunks WHERE version=? AND ordinal=? AND chapter=?").get(job.version, n, c.chapter)?.id ?? null;
    return { ...c, title, sourceVersion: job.source, previous: neighbour(ordinal - 1), next: neighbour(ordinal + 1) };
  }
  if (action === "pause") { if (busy === book) { cancelled = true; controller?.abort(); } return status(book); }
  if (action === "start") {
    if (busy) throw Error("已有图书任务正在运行，请先暂停或等待完成");
    const job = latest(book); if (!job) throw Error("请先准备索引并查看处理量");
    if (strategyIndexConfig(profile ?? defaultStrategyProfile(validateLocalModels(settings))) !== strategyIndexConfig(job.profile ?? defaultStrategyProfile(job.config))) throw Error("切片或向量配置已变化，请先重建该方案的索引");
    if (job.state === "ready") return status(book);
    busy = book; cancelled = false; job.state = "running"; job.error = undefined; save(job); void run(job); return status(book);
  }
  throw Error("不支持的索引操作");
}
parentPort!.on("message", (message: IndexRequest) => {
  void handle(message).then(value => parentPort!.postMessage({ request: message.request, value }), e => parentPort!.postMessage({ request: message.request, error: e instanceof Error ? e.message : String(e) }));
});
