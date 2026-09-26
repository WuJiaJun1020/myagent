import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { access, copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type {
  KnowledgeArtifactSummary,
  KnowledgeCreateBatchRequest,
  KnowledgeDeleteSourceRequest,
  KnowledgeDeleteSourceResult,
  KnowledgeDeleteBatchResult,
  KnowledgeGenerationBatch,
  KnowledgeGenerationAiSettings,
  KnowledgeGenerationEvent,
  KnowledgeGenerationProgress,
  KnowledgeImportFilesResult,
  KnowledgeImportTextRequest,
  KnowledgeImportUrlRequest,
  KnowledgeInterviewImportCounts,
  KnowledgeInterviewImportPayload,
  KnowledgeInterviewImportResult,
  KnowledgeReviewCandidateRequest,
  KnowledgeSourceDetail,
  KnowledgeSourceOriginalPreview,
  KnowledgeSourceSummary,
  KnowledgeStudioSnapshot,
  KnowledgeStudioModelInfo,
  KnowledgeWindowPreview,
  QuestionPackArtifactV1,
} from "../../shared/contracts/knowledge-studio";
import { DEFAULT_KNOWLEDGE_AI_SETTINGS, MAX_KNOWLEDGE_BATCH_QUESTIONS, MAX_KNOWLEDGE_BATCH_SOURCES, type KnowledgeAiStage } from "../../shared/contracts/knowledge-studio";
import type { AiAvailableModel } from "../../platform/shared/ai/model-gateway";
import {
  KNOWLEDGE_PARSER_VERSION,
  parseKnowledgeFile,
  parseKnowledgeText,
  parseKnowledgeUrl,
  type ParsedKnowledgeSource,
} from "./document-parser";
import { KnowledgeStudioDatabase } from "./knowledge-studio-database";
import { KnowledgeGenerationWorkflow, type KnowledgeModelSegment } from "./knowledge-model-provider";

const MAX_TEXT_PREVIEW_BYTES = 2_000_000;

function requiredText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}不能为空`);
  const result = value.trim();
  if (result.length > maximum) throw new Error(`${label}不能超过 ${maximum} 个字符`);
  return result;
}

function validateAiSettings(value: unknown): KnowledgeGenerationAiSettings {
  if (value === undefined) return DEFAULT_KNOWLEDGE_AI_SETTINGS;
  if (!value || typeof value !== "object") throw new Error("AI 参数无效");
  const settings = value as Partial<KnowledgeGenerationAiSettings>;
  let model: KnowledgeGenerationAiSettings["model"];
  if (settings.model !== undefined) {
    const selection = settings.model;
    if (!selection || typeof selection.providerId !== "string" || typeof selection.modelId !== "string"
      || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/u.test(selection.providerId)
      || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/u.test(selection.modelId)
      || selection.providerId.length > 256 || selection.modelId.length > 256) throw new Error("所选模型无效");
    model = { providerId: selection.providerId, modelId: selection.modelId };
  }
  const thinkingLevel = settings.thinkingLevel ?? "default";
  if (!["default", "minimal", "low", "medium", "high", "xhigh", "max"].includes(thinkingLevel)) throw new Error("思考程度无效");
  const timeoutMs = settings.timeoutMs;
  if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 300_000) throw new Error("模型超时必须为 10–300 秒");
  const stages = {} as KnowledgeGenerationAiSettings["stages"];
  for (const stage of ["drafts", "answers", "review"] as const satisfies readonly KnowledgeAiStage[]) {
    const item = settings.stages?.[stage];
    if (!item || typeof item !== "object") throw new Error(`缺少 ${stage} 阶段的 AI 参数`);
    if (typeof item.additionalSystemInstruction !== "string" || item.additionalSystemInstruction.length > 4_000) throw new Error(`${stage} 的补充系统指令不能超过 4000 字符`);
    stages[stage] = { additionalSystemInstruction: item.additionalSystemInstruction.trim() };
  }
  return { ...(model ? { model } : {}), thinkingLevel, timeoutMs, stages };
}

function safeError(error: unknown): string {
  if (!(error instanceof Error)) return "未知错误";
  return error.message.replace(/[\r\n]+/gu, " ").slice(0, 500) || "未知错误";
}

function fileExtension(parsed: ParsedKnowledgeSource): string {
  const original = parsed.originalName ? extname(parsed.originalName).toLowerCase() : "";
  if (original && original.length <= 12) return original;
  return parsed.format === "markdown" ? ".md" : parsed.format === "html" ? ".html" : `.${parsed.format}`;
}

function artifactHash(value: Omit<QuestionPackArtifactV1, "contentHash">): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export type KnowledgeStudioServiceOptions = {
  dataDirectory: string;
  workflow?: Pick<KnowledgeGenerationWorkflow, "generate"> & Partial<Pick<KnowledgeGenerationWorkflow, "plan">>;
  resolveModel?: () => Promise<{ providerId: string; modelId: string } | null>;
  listModels?: () => Promise<AiAvailableModel[]>;
  selectFiles?: () => Promise<string[]>;
  revealPath?: (path: string) => void;
  captureWebPage?: (url: string, targetPath: string) => Promise<void>;
  importToInterview?: (payload: KnowledgeInterviewImportPayload) => Promise<KnowledgeInterviewImportCounts>;
  now?: () => Date;
};

export class KnowledgeStudioService {
  private readonly database: KnowledgeStudioDatabase;
  private readonly sourceDirectory: string;
  private readonly artifactDirectory: string;
  private readonly activeBatches = new Map<string, AbortController>();
  private readonly activeTasks = new Map<string, Promise<void>>();
  private readonly now: () => Date;
  private closed = false;

  constructor(private readonly options: KnowledgeStudioServiceOptions) {
    this.sourceDirectory = join(options.dataDirectory, "sources");
    this.artifactDirectory = join(options.dataDirectory, "artifacts");
    this.database = new KnowledgeStudioDatabase(join(options.dataDirectory, "knowledge-studio.db"));
    this.now = options.now ?? (() => new Date());
    this.migrateOutdatedHtmlSources();
  }

  getSnapshot(): KnowledgeStudioSnapshot {
    this.assertOpen();
    const sources = this.database.listSources();
    const batches = this.database.listBatches();
    return {
      sourceCount: sources.length,
      candidateCount: batches.reduce((sum, batch) => sum + batch.candidateCount, 0),
      publishedCount: batches.filter((batch) => batch.status === "published").length,
      sources,
      batches,
    };
  }

  async getModelInfo(): Promise<KnowledgeStudioModelInfo> {
    this.assertOpen();
    const [model, availableModels] = await Promise.all([
      this.options.resolveModel?.(),
      this.options.listModels?.() ?? Promise.resolve([]),
    ]);
    return model ? { configured: true, ...model, availableModels } : { configured: false, availableModels };
  }

  private async pinAiSettings(settings: KnowledgeGenerationAiSettings): Promise<KnowledgeGenerationAiSettings> {
    if (!this.options.workflow?.plan) return settings;
    const info = await this.getModelInfo();
    const route = settings.model ?? (info.configured && info.providerId && info.modelId
      ? { providerId: info.providerId, modelId: info.modelId } : undefined);
    const model = info.availableModels.find((item) => item.providerId === route?.providerId && item.modelId === route.modelId);
    if (!route || !model?.contextWindowTokens) throw new Error("所选模型的上下文容量未知，无法安全生成。请先确认模型配置和容量元数据");
    return { ...settings, model: route, modelContextWindowTokens: model.contextWindowTokens,
      modelMaxOutputTokens: model.maxOutputTokens };
  }

  async previewBatch(request: unknown): Promise<KnowledgeWindowPreview> {
    this.assertOpen();
    if (!this.options.workflow?.plan) throw new Error("知识工坊模型尚未配置");
    const input = this.validateBatchRequest(request);
    const aiSettings = await this.pinAiSettings(input.aiSettings);
    const sourceById = new Map(input.sourceIds.map((id) => [id, this.database.getSourceSummary(id)]));
    const segments: KnowledgeModelSegment[] = this.database.getSegmentsForSources(input.sourceIds).flatMap((segment) => {
      const sourceId = segment.id.split(":segment:", 1)[0]!;
      const source = sourceById.get(sourceId);
      return source && segment.content ? [{ id: segment.id, sourceId, sourceTitle: source.title,
        heading: segment.heading, content: segment.content }] : [];
    });
    return this.options.workflow.plan({ batchId: "preview", title: input.title, targetRole: input.targetRole,
      difficulty: input.difficulty, questionCount: input.questionCount, segments, aiSettings });
  }

  getSource(id: unknown): KnowledgeSourceDetail | null {
    this.assertOpen();
    return this.database.getSource(requiredText(id, "资料 ID", 160));
  }

  async getSourceOriginal(id: unknown): Promise<KnowledgeSourceOriginalPreview | null> {
    this.assertOpen();
    const sourceId = requiredText(id, "资料 ID", 160);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u.test(sourceId)) throw new Error("资料 ID 格式无效");
    const source = this.database.getSourceSummary(sourceId);
    if (!source) return null;
    const directory = join(this.sourceDirectory, sourceId);
    if (source.format === "html" && source.sourceUrl && this.options.captureWebPage) {
      const snapshotPath = join(directory, "preview.html");
      let snapshotAvailable = true;
      try {
        await access(snapshotPath);
      } catch {
        try {
          await this.options.captureWebPage(source.sourceUrl, snapshotPath);
        } catch {
          snapshotAvailable = false;
        }
      }
      if (snapshotAvailable) {
        const snapshot = await readFile(snapshotPath);
        return {
          sourceId,
          fileName: "离线网页快照",
          mimeType: "text/html; charset=utf-8",
          sizeBytes: snapshot.byteLength,
          mode: "html",
          previewUrl: `knowledge-source://${sourceId}/preview.html`,
          truncated: false,
          extracted: false,
        };
      }
    }
    const entries = await readdir(directory, { withFileTypes: true });
    const original = entries.find((entry) => entry.isFile() && /^original(?:\.|$)/u.test(entry.name));
    if (!original) throw new Error("保存的源文件不存在");
    const raw = await readFile(join(directory, original.name));
    const fileName = source.originalName || original.name;
    if (source.format === "pdf") {
      return {
        sourceId,
        fileName,
        mimeType: "application/pdf",
        sizeBytes: raw.byteLength,
        mode: "pdf",
        data: new Uint8Array(raw),
        truncated: false,
        extracted: false,
      };
    }
    if (source.format === "docx") {
      return {
        sourceId,
        fileName,
        mimeType: "text/plain; charset=utf-8",
        sizeBytes: raw.byteLength,
        mode: "text",
        content: this.database.getSourceContent(sourceId) ?? "",
        truncated: false,
        extracted: true,
      };
    }
    const truncated = raw.byteLength > MAX_TEXT_PREVIEW_BYTES;
    const content = raw.subarray(0, MAX_TEXT_PREVIEW_BYTES).toString("utf8").replace(/^\uFEFF/u, "");
    return {
      sourceId,
      fileName,
      mimeType: source.format === "html" ? "text/html; charset=utf-8" : source.format === "markdown" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
      sizeBytes: raw.byteLength,
      mode: "text",
      content,
      truncated,
      extracted: false,
    };
  }

  async importText(request: unknown): Promise<KnowledgeSourceSummary> {
    this.assertOpen();
    const value = request as Partial<KnowledgeImportTextRequest> | null;
    if (!value || typeof value !== "object") throw new Error("资料参数无效");
    const title = requiredText(value.title, "资料标题", 200);
    const content = requiredText(value.content, "资料内容", 1_500_000);
    const format = value.format === "markdown" || value.format === "html" ? value.format : "text";
    const id = randomUUID();
    return this.persistSource(id, parseKnowledgeText(id, title, content, format));
  }

  async importFiles(): Promise<KnowledgeImportFilesResult> {
    this.assertOpen();
    if (!this.options.selectFiles) throw new Error("当前环境不支持选择资料文件");
    const paths = await this.options.selectFiles();
    const result: KnowledgeImportFilesResult = { sources: [], failures: [] };
    for (const path of paths.slice(0, 30)) {
      try {
        const id = randomUUID();
        result.sources.push(await this.persistSource(id, await parseKnowledgeFile(id, path), path));
      } catch (error) {
        result.failures.push({ name: basename(path), error: safeError(error) });
      }
    }
    return result;
  }

  async importUrl(request: unknown): Promise<KnowledgeSourceSummary> {
    this.assertOpen();
    const value = request as Partial<KnowledgeImportUrlRequest> | null;
    if (!value || typeof value !== "object") throw new Error("网页资料参数无效");
    const url = requiredText(value.url, "网页地址", 2_000);
    const title = typeof value.title === "string" && value.title.trim() ? value.title.trim().slice(0, 200) : undefined;
    const id = randomUUID();
    return this.persistSource(id, await parseKnowledgeUrl(id, url, title));
  }

  async deleteSource(request: unknown, deleteReferencingBatches?: unknown): Promise<KnowledgeDeleteSourceResult> {
    this.assertOpen();
    const value = typeof request === "string"
      ? { id: request, deleteReferencingBatches: deleteReferencingBatches === true }
      : request as Partial<KnowledgeDeleteSourceRequest> | null;
    if (!value || typeof value !== "object") throw new Error("删除资料参数无效");
    const sourceId = requiredText(value.id, "资料 ID", 160);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u.test(sourceId)) throw new Error("资料 ID 格式无效");
    const references = this.database.getSourceReferences(sourceId);
    const running = references.find((reference) => this.activeBatches.has(reference.batchId));
    if (running) throw new Error(`生成任务“${running.batchTitle}”仍在运行，请先取消任务再删除资料`);
    const result = this.database.deleteSource(sourceId, value.deleteReferencingBatches === true);
    if (result.deleted) await rm(join(this.sourceDirectory, sourceId), { recursive: true, force: true });
    await this.removeArtifactFiles(result.artifactPaths);
    return {
      deleted: result.deleted,
      deletedBatchCount: result.deletedBatchIds.length,
      deletedArtifactCount: result.artifactPaths.length,
    };
  }

  async deleteBatch(id: unknown): Promise<KnowledgeDeleteBatchResult> {
    this.assertOpen();
    const batchId = requiredText(id, "任务 ID", 160);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u.test(batchId)) throw new Error("任务 ID 格式无效");
    const batch = this.database.getBatch(batchId);
    if (batch && this.activeBatches.has(batchId)) throw new Error("生成任务仍在运行，请先取消任务再删除");
    const result = this.database.deleteBatch(batchId);
    await this.removeArtifactFiles(result.artifactPaths);
    this.migrateOutdatedHtmlSources();
    return { deleted: result.deleted, deletedArtifactCount: result.artifactPaths.length };
  }

  async createBatch(request: unknown, onProgress?: (progress: KnowledgeGenerationProgress) => void): Promise<KnowledgeGenerationBatch> {
    this.assertOpen();
    if (!this.options.workflow) throw new Error("知识工坊模型尚未配置");
    const input = this.validateBatchRequest(request);
    input.aiSettings = await this.pinAiSettings(input.aiSettings);
    const createdAt = this.now().toISOString();
    const batch = this.database.createBatch({ id: randomUUID(), ...input, createdAt });
    this.startBatch(batch.id, onProgress);
    return batch;
  }

  async retryBatch(id: unknown, onProgress?: (progress: KnowledgeGenerationProgress) => void): Promise<KnowledgeGenerationBatch> {
    this.assertOpen();
    if (!this.options.workflow) throw new Error("知识工坊模型尚未配置");
    const batchId = requiredText(id, "任务 ID", 160);
    if (this.activeBatches.has(batchId)) throw new Error("该生成任务仍在运行");
    const existing = this.database.getBatch(batchId);
    if (existing && !existing.aiSettings?.modelContextWindowTokens && this.options.workflow.plan) {
      this.database.updateBatchAiSettings(batchId, await this.pinAiSettings(existing.aiSettings ?? DEFAULT_KNOWLEDGE_AI_SETTINGS));
    }
    const batch = this.database.resetBatch(batchId, this.now().toISOString());
    this.startBatch(batchId, onProgress);
    return batch;
  }

  cancelBatch(id: unknown): KnowledgeGenerationBatch {
    this.assertOpen();
    const batchId = requiredText(id, "任务 ID", 160);
    this.activeBatches.get(batchId)?.abort(new Error("用户取消生成"));
    const batch = this.database.getBatch(batchId);
    if (!batch) throw new Error("生成任务不存在");
    return batch;
  }

  getBatch(id: unknown): KnowledgeGenerationBatch | null {
    this.assertOpen();
    return this.database.getBatch(requiredText(id, "任务 ID", 160));
  }

  reviewCandidate(request: unknown): KnowledgeGenerationBatch {
    this.assertOpen();
    const value = request as Partial<KnowledgeReviewCandidateRequest> | null;
    if (!value || typeof value !== "object") throw new Error("审核参数无效");
    const candidateId = requiredText(value.candidateId, "候选题 ID", 220);
    if (value.status !== "pending" && value.status !== "approved" && value.status !== "rejected") {
      throw new Error("审核状态无效");
    }
    const existing = this.database.getCandidate(candidateId);
    if (!existing) throw new Error("候选题不存在");
    if (value.status === "approved" && existing.validationStatus === "rejected") {
      throw new Error("模型校验已拒绝该题，请修改后重新生成，而不是直接发布");
    }
    this.database.reviewCandidate({
      candidateId,
      status: value.status!,
      ...(typeof value.question === "string" ? { question: requiredText(value.question, "题目", 1_200) } : {}),
      ...(typeof value.answer === "string" ? { answer: requiredText(value.answer, "答案", 8_000) } : {}),
      ...(Array.isArray(value.rubric) ? { rubric: value.rubric } : {}),
      ...(Array.isArray(value.pitfalls) ? { pitfalls: value.pitfalls } : {}),
      ...(Array.isArray(value.followUps) ? { followUps: value.followUps } : {}),
    }, this.now().toISOString());
    return this.database.getBatch(existing.batchId)!;
  }

  async publishBatch(id: unknown): Promise<KnowledgeGenerationBatch> {
    this.assertOpen();
    const batchId = requiredText(id, "任务 ID", 160);
    const batch = this.database.getBatch(batchId);
    if (!batch) throw new Error("生成任务不存在");
    if (batch.status !== "review" && batch.status !== "published") throw new Error("任务尚未进入人工审核阶段");
    if (batch.candidates.some((candidate) => candidate.humanStatus === "pending")) throw new Error("仍有候选题未完成审核");
    const approved = batch.candidates.filter((candidate) => candidate.humanStatus === "approved");
    if (approved.length === 0) throw new Error("至少需要审核通过一道题才能发布");
    const sources = batch.sourceIds.map((sourceId) => this.database.getSourceSummary(sourceId)).filter(Boolean) as KnowledgeSourceSummary[];
    const version = this.database.nextArtifactVersion(batchId);
    const createdAt = this.now().toISOString();
    const artifactId = randomUUID();
    const withoutHash: Omit<QuestionPackArtifactV1, "contentHash"> = {
      schemaVersion: 1,
      artifactId,
      version,
      title: batch.title,
      targetRole: batch.targetRole,
      generatedAt: createdAt,
      generation: {
        model: batch.providerId && batch.modelId
          ? { providerId: batch.providerId, modelId: batch.modelId }
          : batch.aiSettings?.model ?? null,
        thinkingLevel: batch.aiSettings?.thinkingLevel ?? "unknown",
      },
      sources: sources.map((source) => ({
        id: source.id, title: source.title, format: source.format, contentHash: source.contentHash,
        ...(source.sourceUrl ? { sourceUrl: source.sourceUrl } : {}),
      })),
      questions: approved.map(({ batchId: _batchId, humanStatus: _humanStatus, updatedAt: _updatedAt, ...question }) => question),
      validationSummary: {
        supported: approved.filter((item) => item.validationStatus === "supported").length,
        needsReview: approved.filter((item) => item.validationStatus === "needs_review").length,
        rejected: batch.candidates.filter((item) => item.validationStatus === "rejected").length,
        humanApproved: approved.length,
      },
    };
    const contentHash = artifactHash(withoutHash);
    const artifact: QuestionPackArtifactV1 = { ...withoutHash, contentHash };
    await mkdir(this.artifactDirectory, { recursive: true });
    const path = join(this.artifactDirectory, `${batchId}-v${version}.json`);
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
    const summary: KnowledgeArtifactSummary = {
      id: artifactId, batchId, version, path, contentHash, questionCount: approved.length, createdAt,
    };
    this.database.createArtifact(summary);
    this.database.updateBatch(batchId, { status: "published", stage: "published", progress: 100, updatedAt: createdAt });
    return this.database.getBatch(batchId)!;
  }

  async importSupportedToInterview(id: unknown): Promise<KnowledgeInterviewImportResult> {
    this.assertOpen();
    if (!this.options.importToInterview) throw new Error("智能面试题库不可用");
    const batchId = requiredText(id, "任务 ID", 160);
    const batch = this.database.getBatch(batchId);
    if (!batch) throw new Error("生成任务不存在");
    if (batch.status !== "review" && batch.status !== "published") throw new Error("请等待生成任务进入审核阶段");
    const sourceDetails = new Map(batch.sourceIds.map((sourceId) => [sourceId, this.database.getSource(sourceId)]));
    const segmentContents = new Map<string, Map<string, string>>();
    for (const [sourceId, detail] of sourceDetails) {
      if (detail) segmentContents.set(sourceId, new Map(detail.segments.map((segment) => [segment.id, segment.content])));
    }
    const eligible = batch.candidates.filter((candidate) => candidate.validationStatus === "supported"
      && candidate.humanStatus !== "rejected" && candidate.answer.trim() && candidate.rubric.length > 0
      && candidate.evidence.length > 0 && candidate.evidence.every((evidence) => {
        const content = segmentContents.get(evidence.sourceId)?.get(evidence.segmentId);
        return Boolean(evidence.quote && content?.includes(evidence.quote));
      }));
    if (!eligible.length) throw new Error("当前任务没有原文引文可逐字核对的证据支持题");
    const payload: KnowledgeInterviewImportPayload = {
      batchId: batch.id,
      title: batch.title,
      targetRole: batch.targetRole,
      sources: [...sourceDetails.values()].filter((source): source is NonNullable<typeof source> => Boolean(source)).map((source) => ({
        id: source.id, title: source.title, kind: source.kind, format: source.format,
        contentHash: source.contentHash, ...(source.sourceUrl ? { sourceUrl: source.sourceUrl } : {}),
      })),
      questions: eligible.map((candidate) => ({
        id: candidate.id, ordinal: candidate.ordinal, kind: candidate.kind, difficulty: candidate.difficulty,
        competency: candidate.competency, question: candidate.question, answer: candidate.answer,
        rubric: candidate.rubric, pitfalls: candidate.pitfalls, followUps: candidate.followUps,
        evidence: candidate.evidence,
      })),
    };
    const counts = await this.options.importToInterview(payload);
    return { eligibleCount: eligible.length, skippedCount: batch.candidates.length - eligible.length, ...counts };
  }

  revealArtifact(path: unknown): void {
    this.assertOpen();
    const target = resolve(requiredText(path, "产物路径", 2_000));
    const root = `${resolve(this.artifactDirectory)}\\`;
    if (!target.toLowerCase().startsWith(root.toLowerCase())) throw new Error("只能打开知识工坊产物目录中的文件");
    this.options.revealPath?.(target);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const controller of this.activeBatches.values()) controller.abort(new Error("知识工坊正在关闭"));
    await Promise.allSettled(this.activeTasks.values());
    this.database.close();
  }

  private startBatch(batchId: string, onProgress?: (progress: KnowledgeGenerationProgress) => void): void {
    const task = this.runBatch(batchId, onProgress)
      .then(() => undefined, () => undefined)
      .finally(() => this.activeTasks.delete(batchId));
    this.activeTasks.set(batchId, task);
  }

  private async removeArtifactFiles(paths: string[]): Promise<void> {
    const root = `${resolve(this.artifactDirectory)}\\`;
    await Promise.all(paths.map(async (artifactPath) => {
      const target = resolve(artifactPath);
      if (target.toLowerCase().startsWith(root.toLowerCase())) await rm(target, { force: true });
    }));
  }

  private migrateOutdatedHtmlSources(): void {
    const sources = this.database.listOutdatedUnreferencedHtmlSources(KNOWLEDGE_PARSER_VERSION);
    for (const source of sources) {
      const originalPath = ["original.html", "original.htm"]
        .map((name) => join(this.sourceDirectory, source.id, name))
        .find((path) => existsSync(path));
      if (!originalPath) continue;
      try {
        const original = readFileSync(originalPath, "utf8");
        const parsed = parseKnowledgeText(source.id, source.title, original, "html");
        this.database.replaceSourceDerivedContent(source.id, {
          ...parsed,
          title: source.title,
          kind: source.kind,
          ...(source.originalName ? { originalName: source.originalName } : {}),
          ...(source.sourceUrl ? { sourceUrl: source.sourceUrl } : {}),
        }, KNOWLEDGE_PARSER_VERSION);
      } catch (error) {
        // A single damaged or duplicate legacy source must not prevent startup.
        console.warn(`重新清洗旧 HTML 资料失败：${source.id}`, error);
      }
    }
  }

  private async persistSource(id: string, parsed: ParsedKnowledgeSource, originalPath?: string): Promise<KnowledgeSourceSummary> {
    const existing = this.database.getSourceByHash(parsed.contentHash);
    if (existing) return existing;
    const directory = join(this.sourceDirectory, id);
    await mkdir(directory, { recursive: true });
    const target = join(directory, `original${fileExtension(parsed)}`);
    try {
      if (originalPath) await copyFile(originalPath, target);
      else await writeFile(target, parsed.raw);
      if (parsed.kind === "url" && parsed.format === "html" && parsed.sourceUrl && this.options.captureWebPage) {
        try {
          await this.options.captureWebPage(parsed.sourceUrl, join(directory, "preview.html"));
        } catch {
          // The raw source remains valid evidence. A snapshot can be retried lazily on first preview.
        }
      }
      return this.database.addSource(id, parsed, this.now().toISOString());
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  private validateBatchRequest(request: unknown): {
    title: string;
    targetRole: string;
    questionCount: number;
    difficulty: KnowledgeCreateBatchRequest["difficulty"];
    sourceIds: string[];
    aiSettings: KnowledgeGenerationAiSettings;
  } {
    const value = request as Partial<KnowledgeCreateBatchRequest> | null;
    if (!value || typeof value !== "object") throw new Error("生成任务参数无效");
    if (value.privacyConfirmed !== true) throw new Error("需要确认所选资料将发送给当前模型 Provider");
    const sourceIds = Array.from(new Set(Array.isArray(value.sourceIds) ? value.sourceIds.map((id) => requiredText(id, "资料 ID", 160)) : []));
    if (sourceIds.length === 0 || sourceIds.length > MAX_KNOWLEDGE_BATCH_SOURCES) throw new Error(`请选择 1-${MAX_KNOWLEDGE_BATCH_SOURCES} 份资料`);
    for (const sourceId of sourceIds) if (!this.database.getSourceSummary(sourceId)) throw new Error("所选资料不存在或已删除");
    const questionCount = Number(value.questionCount);
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > MAX_KNOWLEDGE_BATCH_QUESTIONS) throw new Error(`题目数量必须为 1-${MAX_KNOWLEDGE_BATCH_QUESTIONS}`);
    const difficulty = ["basic", "intermediate", "advanced", "mixed"].includes(String(value.difficulty))
      ? value.difficulty as KnowledgeCreateBatchRequest["difficulty"] : "mixed";
    return {
      title: requiredText(value.title, "任务标题", 200),
      targetRole: requiredText(value.targetRole, "目标岗位", 200),
      questionCount,
      difficulty,
      sourceIds,
      aiSettings: validateAiSettings(value.aiSettings),
    };
  }

  private async runBatch(batchId: string, onProgress?: (progress: KnowledgeGenerationProgress) => void): Promise<KnowledgeGenerationBatch> {
    const batch = this.database.getBatch(batchId);
    if (!batch) throw new Error("生成任务不存在");
    if (this.activeBatches.has(batchId)) throw new Error("该生成任务仍在运行");
    const controller = new AbortController();
    this.activeBatches.set(batchId, controller);
    let activeStage: KnowledgeGenerationProgress["stage"] = "extracting";
    const emit = (
      stage: KnowledgeGenerationProgress["stage"],
      progress: number,
      message: string,
      detail: {
        state: NonNullable<KnowledgeGenerationProgress["eventState"]>;
        providerId?: string;
        modelId?: string;
        usage?: KnowledgeGenerationProgress["usage"];
        details?: KnowledgeGenerationEvent["details"];
      },
    ) => {
      activeStage = stage;
      const status = stage === "review" ? "review" : stage === "failed" ? "failed" : stage === "cancelled" ? "cancelled" : "running";
      const createdAt = this.now().toISOString();
      this.database.updateBatch(batchId, {
        status, stage, progress, updatedAt: createdAt,
        providerId: detail.providerId,
        modelId: detail.modelId,
      });
      const event = this.database.addGenerationEvent({
        batchId, stage, state: detail.state, progress, message, createdAt,
        ...(detail.providerId ? { providerId: detail.providerId } : {}),
        ...(detail.modelId ? { modelId: detail.modelId } : {}),
        ...(detail.usage ? { usage: detail.usage } : {}),
        ...(detail.details ? { details: detail.details } : {}),
      });
      onProgress?.({
        batchId, status, stage, progress, message, eventState: detail.state,
        ...(detail.providerId ? { providerId: detail.providerId } : {}),
        ...(detail.modelId ? { modelId: detail.modelId } : {}),
        ...(detail.usage ? { usage: detail.usage } : {}),
        event,
      });
    };
    try {
      emit("extracting", 5, "正在准备资料片段", { state: "running" });
      const sources = batch.sourceIds.map((id) => this.database.getSourceSummary(id)).filter(Boolean) as KnowledgeSourceSummary[];
      const sourceById = new Map(sources.map((source) => [source.id, source]));
      const allSegments = this.database.getSegmentsForSources(batch.sourceIds);
      const selected: KnowledgeModelSegment[] = [];
      const sourceCounts = new Map(sources.map((source) => [source.id, {
        sourceId: source.id, title: source.title, available: 0, included: 0, includedCharacters: 0,
      }]));
      for (const segment of allSegments) {
        const count = sourceCounts.get(segment.id.split(":segment:", 1)[0]);
        if (count) count.available += 1;
      }
      const selectedMetadata: NonNullable<NonNullable<KnowledgeGenerationEvent["details"]>["selection"]>["segments"] = [];
      let used = 0;
      for (const segment of allSegments) {
        const sourceId = segment.id.split(":segment:", 1)[0];
        const source = sourceById.get(sourceId);
        if (!source) continue;
        const content = segment.content;
        if (!content) continue;
        selected.push({ id: segment.id, sourceId, sourceTitle: source.title, heading: segment.heading, content });
        selectedMetadata.push({ id: segment.id, sourceId, heading: segment.heading,
          originalCharacters: segment.content.length, includedCharacters: content.length });
        const count = sourceCounts.get(sourceId);
        if (count) { count.included += 1; count.includedCharacters += content.length; }
        used += content.length;
      }
      if (selected.length === 0) throw new Error("所选资料没有可用于生成的正文片段");
      emit("extracting", 10, `本地准备完成：${sources.length} 份资料中的 ${selected.length} 个片段，共 ${used.toLocaleString()} 字符；尚未发起模型调用`, {
        state: "running", details: { kind: "source-selection", selection: {
          order: "数据库 document_id、ordinal 升序（不是勾选顺序或相关性排序）；全部片段交给分窗规划",
          availableSegments: allSegments.length, selectedSegments: selected.length, selectedCharacters: used,
          sources: [...sourceCounts.values()], segments: selectedMetadata,
        } },
      });
      const workflow = this.options.workflow!;
      const result = await workflow.generate({
        batchId, title: batch.title, targetRole: batch.targetRole,
        difficulty: batch.difficulty, questionCount: batch.requestedQuestionCount, segments: selected,
        aiSettings: batch.aiSettings ?? DEFAULT_KNOWLEDGE_AI_SETTINGS,
        previousEvents: batch.events,
      }, controller.signal, (stage, progress, message, detail) => emit(stage, progress, message, detail));
      this.database.replaceCandidates(batchId, result.candidates, this.now().toISOString());
      emit("review", 100, "候选题已生成，请进行人工审核", {
        state: "completed",
        providerId: result.providerId,
        modelId: result.modelId,
        usage: result.usage,
      });
      this.database.updateBatch(batchId, {
        status: "review", stage: "review", progress: 100, updatedAt: this.now().toISOString(),
        providerId: result.providerId, modelId: result.modelId, usage: result.usage,
      });
      return this.database.getBatch(batchId)!;
    } catch (error) {
      const cancelled = controller.signal.aborted;
      const stage = cancelled ? "cancelled" : "failed";
      const status = cancelled ? "cancelled" : "failed";
      const message = cancelled ? "生成任务已取消" : safeError(error);
      const createdAt = this.now().toISOString();
      this.database.updateBatch(batchId, { status, stage, progress: 0, error: message, updatedAt: createdAt });
      const event = this.database.addGenerationEvent({
        batchId,
        stage: activeStage,
        state: cancelled ? "cancelled" : "failed",
        progress: 0,
        message,
        createdAt,
      });
      onProgress?.({
        batchId, status, stage, progress: 0, message,
        eventState: cancelled ? "cancelled" : "failed",
        event,
      });
      if (!cancelled) throw error;
      return this.database.getBatch(batchId)!;
    } finally {
      this.activeBatches.delete(batchId);
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("知识工坊服务已关闭");
  }
}
