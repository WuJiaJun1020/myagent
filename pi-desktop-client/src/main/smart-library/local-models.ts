import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_LIBRARY_LOCAL_MODELS, type LibraryLocalModels, type LibraryModelProbe } from "../../shared/contracts/smart-library";
import { LIBRARY_RERANK_CASES } from "../../shared/contracts/library-model-cases";

// Stage 0 uses only a fixed, original diagnostic sample, never a user's book.
export const PROBE_QUERY = "林舟把铜钥匙交给了谁？";
export const PROBE_DOCUMENTS = ["山顶下起了小雨，众人回屋休息。", "林舟把铜钥匙交给了苏禾，请她保管。"];

export function localEndpoint(value: unknown): string {
  if (typeof value !== "string") throw Error("请输入本机接口地址");
  let url: URL;
  try { url = new URL(value); } catch { throw Error("接口地址格式不正确"); }
  if (!["http:", "https:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    || url.username || url.password || url.search || url.hash) {
    throw Error("仅允许 localhost、127.0.0.1 或 [::1] 的本机接口，不允许云端地址、凭据或查询参数");
  }
  // Pin localhost to loopback rather than allowing hosts/DNS configuration to resolve elsewhere.
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.href;
}

export function validateLocalModels(input: LibraryLocalModels): LibraryLocalModels {
  if (!input || typeof input !== "object") throw Error("本地模型配置无效");
  const model = (v: unknown) => {
    if (typeof v !== "string" || !v.trim() || v.length > 200 || /[\r\n]/.test(v)) throw Error("请输入有效的模型名称");
    return v.trim();
  };
  return { embeddingUrl: localEndpoint(input.embeddingUrl), embeddingModel: model(input.embeddingModel),
    rerankerUrl: localEndpoint(input.rerankerUrl), rerankerModel: model(input.rerankerModel) };
}

export class LibraryLocalModelService {
  private writes = Promise.resolve();
  private active = false;
  private controller?: AbortController;
  constructor(private root: string, private request: typeof fetch = fetch) {}
  async get(): Promise<LibraryLocalModels> {
    await this.writes;
    try {
      const settings = validateLocalModels(JSON.parse(await readFile(join(this.root, "local-models.json"), "utf8")));
      // Migrate only previous stage-0 defaults; leave custom models/endpoints intact.
      if (settings.embeddingUrl === "http://127.0.0.1:11434/api/embed" && settings.embeddingModel === "qwen3-embedding:0.6b") {
        settings.embeddingUrl = DEFAULT_LIBRARY_LOCAL_MODELS.embeddingUrl;
        settings.embeddingModel = DEFAULT_LIBRARY_LOCAL_MODELS.embeddingModel;
      }
      if (settings.rerankerUrl === "http://127.0.0.1:18081/rerank" && settings.rerankerModel === "Xenova/bge-reranker-base") {
        settings.rerankerModel = DEFAULT_LIBRARY_LOCAL_MODELS.rerankerModel;
      }
      return settings;
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_LIBRARY_LOCAL_MODELS }; throw Error("读取本地模型配置失败，请检查 local-models.json"); }
  }
  save(input: LibraryLocalModels): Promise<void> {
    const settings = validateLocalModels(input);
    const task = this.writes.then(async () => {
      await mkdir(this.root, { recursive: true });
      const file = join(this.root, "local-models.json");
      await writeFile(file + ".tmp", JSON.stringify(settings, null, 2));
      await rename(file + ".tmp", file);
    });
    this.writes = task.catch(() => {});
    return task;
  }
  async dispose() { this.controller?.abort(); await this.writes; }
  isBusy() { return this.active; }
  async probe(kind: "embedding" | "reranker", input: LibraryLocalModels, caseId = "direct"): Promise<LibraryModelProbe> {
    if (kind !== "embedding" && kind !== "reranker") throw Error("未知模型类型");
    const settings = validateLocalModels(input);
    const sample = LIBRARY_RERANK_CASES.find(c => c.id === caseId);
    if (!sample) throw Error("未知测试案例");
    if (this.active) throw Error("已有模型测试正在执行，请稍候");
    this.active = true;
    const start = performance.now();
    const controller = this.controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      let response: Response;
      try {
        response = await this.request(kind === "embedding" ? settings.embeddingUrl : settings.rerankerUrl, {
          method: "POST", redirect: "error", signal: controller.signal, headers: { "Content-Type": "application/json" },
          body: JSON.stringify(kind === "embedding"
            ? { model: settings.embeddingModel, input: PROBE_DOCUMENTS, truncate: false }
            : { model: settings.rerankerModel, query: sample.query, documents: sample.documents, top_n: sample.documents.length }),
        });
      } catch { throw Error(controller.signal.aborted ? "本地模型测试已中断或超过 90 秒；请检查模型加载状态" : "无法连接本地模型服务，请检查服务是否启动、端口及接口路径（不接受重定向）"); }
      if (!response.ok) {
        await response.body?.cancel();
        throw Error(`本地接口返回 HTTP ${response.status}；${response.status === 404 ? "请检查模型是否已下载，以及接口路径是否正确" : "请查看本地服务终端，检查模型、内存或接口格式"}`);
      }
      // Bound even malformed server responses; do not echo arbitrary service text into UI/logs.
      const reader = response.body?.getReader();
      if (!reader) throw Error("本地服务返回空响应");
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 2 * 1024 * 1024) { await reader.cancel(); throw Error("模型测试响应过大"); }
        chunks.push(value);
      }
      let data: any;
      try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw Error("本地服务未返回有效 JSON"); }
      const elapsedMs = Math.round(performance.now() - start);
      if (kind === "embedding") {
        const vectors = data?.embeddings;
        const dimensions = vectors?.[0]?.length;
        if (!Array.isArray(vectors) || vectors.length !== 2 || !Number.isInteger(dimensions) || dimensions < 1 || dimensions > 32768
          || !vectors.every((v: unknown) => Array.isArray(v) && v.length === dimensions && v.every(n => typeof n === "number" && Number.isFinite(n)) && v.some(n => n !== 0))) {
          throw Error("向量响应无效：需要两条同维度、非零且数值有效的 embeddings");
        }
        return { elapsedMs, dimensions, summary: `向量接口可用：2 条文本，${dimensions} 维。此结果只验证接口，不代表检索质量已达标。` };
      }
      const rows = data?.results;
      if (!Array.isArray(rows) || rows.length !== sample.documents.length || new Set(rows.map(r => r?.index)).size !== sample.documents.length
        || !rows.every(r => Number.isInteger(r?.index) && r.index >= 0 && r.index < sample.documents.length && typeof r.relevance_score === "number" && Number.isFinite(r.relevance_score))) {
        throw Error("重排响应无效：需要 results 中的 index 和 relevance_score，且不能重复或遗漏");
      }
      const ranking = [...rows].sort((a, b) => b.relevance_score - a.relevance_score).map(r => r.index);
      const scores = [...rows].sort((a, b) => b.relevance_score - a.relevance_score).map(r => ({ index: r.index, score: r.relevance_score }));
      const boundary = sample.preferred.length;
      const matched = boundary ? sample.preferred.every(i => ranking.slice(0, boundary).includes(i))
        && (boundary === scores.length || scores[boundary - 1].score > scores[boundary].score) : undefined;
      return { elapsedMs, ranking, scores, caseId, matched, summary: matched === undefined
        ? "该组没有答案，排名第一不代表原文能够回答；请检查证据内容。"
        : matched ? "相关原文排在预期位置。仅为诊断样本结果，不代表整书准确率。"
        : "排序不符合预期或存在并列；请查看各段原文和得分。" };
    } catch (error) {
      if (controller.signal.aborted) throw Error("本地模型测试已中断或超过 90 秒；请检查模型加载状态");
      throw error;
    } finally { clearTimeout(timer); this.active = false; this.controller = undefined; }
  }
}
