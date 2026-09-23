import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Cpu,
  FileText,
  FolderOpen,
  Globe2,
  LoaderCircle,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Eye,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MAX_KNOWLEDGE_BATCH_SOURCES,
  MAX_KNOWLEDGE_BATCH_QUESTIONS,
  DEFAULT_KNOWLEDGE_AI_SETTINGS,
  KNOWLEDGE_STUDIO_PROMPT_VERSION,
  knowledgeSystemPrompt,
  type KnowledgeAiStage,
  type KnowledgeGenerationAiSettings,
  type KnowledgeWindowPreview,
  type KnowledgeGenerationBatchSummary,
  type KnowledgeQuestionCandidate,
  type KnowledgeRubricItem,
  type KnowledgeSourceSummary,
  type KnowledgeSourceDetail,
  type KnowledgeSourceOriginalPreview,
} from "../../../shared/contracts/knowledge-studio";
import { knowledgeStudioGateway } from "../../services/knowledge-studio-gateway";
import { useKnowledgeStudioStore } from "../../stores/knowledge-studio-store";
import { KnowledgeGenerationProcess } from "./KnowledgeGenerationProcess";
import { readSavedGenerationModel, readSavedGenerationSources, readSavedGenerationThinkingLevel, reconcileGenerationSources, saveGenerationModel, saveGenerationSources, saveGenerationThinkingLevel } from "./generation-preferences";

function formatLabel(format: KnowledgeSourceSummary["format"]): string {
  return ({ text: "TXT", markdown: "MD", html: "HTML", pdf: "PDF", docx: "DOCX" })[format];
}

function statusLabel(status: string): string {
  return ({ queued: "等待中", running: "生成中", review: "待审核", published: "已发布", failed: "失败", cancelled: "已取消" } as Record<string, string>)[status] ?? status;
}

function generationModelLabel(batch: KnowledgeGenerationBatchSummary): string {
  const model = batch.providerId && batch.modelId
    ? { providerId: batch.providerId, modelId: batch.modelId }
    : batch.aiSettings?.model;
  return model ? `${model.providerId} / ${model.modelId}` : "模型未记录";
}

function generationThinkingLabel(batch: KnowledgeGenerationBatchSummary): string {
  const level = batch.aiSettings?.thinkingLevel;
  if (!level) return "思考程度未记录";
  return level === "default" ? "模型默认思考" : `思考：${({ minimal: "最少", low: "低", medium: "中", high: "高", xhigh: "超高", max: "最大" } as const)[level]}`;
}

function validationLabel(status: KnowledgeQuestionCandidate["validationStatus"]): string {
  return status === "supported" ? "证据支持" : status === "rejected" ? "校验拒绝" : "需要复核";
}

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

function htmlPreviewDocument(content: string): string {
  const guard = [
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; object-src \'none\'; frame-src \'none\'; connect-src \'none\'; form-action \'none\'; style-src \'unsafe-inline\' data:; img-src data: blob:; font-src data:; media-src data: blob:">',
    "<style>html{color-scheme:light;background:#fff}body{min-height:100vh;margin:0;color:#1f2937;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.65}a,button,input,select,textarea,form{pointer-events:none!important}iframe,object,embed,script,link{display:none!important}img:not([src^='data:']):not([src^='blob:']){display:none!important}img{max-width:100%;height:auto}</style>",
  ].join("");
  const safeContent = content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu, "")
    .replace(/<script\b[^>]*\/?>/giu, "")
    .replace(/<link\b[^>]*>/giu, "")
    .replace(/<(?:iframe|object|embed)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed)\s*>/giu, "")
    .replace(/<(?:iframe|object|embed)\b[^>]*\/?>/giu, "")
    .replace(/<base\b[^>]*>/giu, "")
    .replace(/<meta\b(?=[^>]*http-equiv\s*=\s*(?:["']?refresh["']?))[^>]*>/giu, "");
  if (/<head\b[^>]*>/iu.test(safeContent)) return safeContent.replace(/<head\b[^>]*>/iu, (head) => `${head}${guard}`);
  if (/<html\b[^>]*>/iu.test(safeContent)) return safeContent.replace(/<html\b[^>]*>/iu, (html) => `${html}<head>${guard}</head>`);
  return `<!doctype html><html><head>${guard}</head><body>${safeContent}</body></html>`;
}

function SourceSegments({ detail, comparison = false }: { detail: KnowledgeSourceDetail; comparison?: boolean }) {
  return (
    <div className={`knowledge-preview ${comparison ? "comparison" : ""}`}>
      {detail.segments.map((segment) => (
        <article key={segment.id}>
          <header>
            <span>#{segment.ordinal + 1}</span>
            <strong>{segment.heading || "正文片段"}</strong>
            <code>{segment.startOffset.toLocaleString()}–{segment.endOffset.toLocaleString()}</code>
          </header>
          <p>{segment.content}</p>
        </article>
      ))}
    </div>
  );
}

function SourcesPanel() {
  const snapshot = useKnowledgeStudioStore((state) => state.snapshot);
  const detail = useKnowledgeStudioStore((state) => state.sourceDetail);
  const selectedId = useKnowledgeStudioStore((state) => state.selectedSourceId);
  const busy = useKnowledgeStudioStore((state) => state.busy);
  const selectSource = useKnowledgeStudioStore((state) => state.selectSource);
  const importFiles = useKnowledgeStudioStore((state) => state.importFiles);
  const importText = useKnowledgeStudioStore((state) => state.importText);
  const importUrl = useKnowledgeStudioStore((state) => state.importUrl);
  const deleteSource = useKnowledgeStudioStore((state) => state.deleteSource);
  const [mode, setMode] = useState<"none" | "text" | "url">("none");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [originalPreview, setOriginalPreview] = useState<KnowledgeSourceOriginalPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    setComparisonOpen(false);
    setOriginalPreview(null);
    setPreviewError(null);
  }, [detail?.id]);

  useEffect(() => {
    if (originalPreview?.mode !== "pdf" || !originalPreview.data) {
      setPdfUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([new Uint8Array(originalPreview.data)], { type: "application/pdf" }));
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [originalPreview]);

  const openComparison = async () => {
    if (!detail) return;
    setComparisonOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setOriginalPreview(null);
    try {
      const preview = await knowledgeStudioGateway.getSourceOriginal(detail.id);
      if (!preview) throw new Error("资料不存在或已经删除");
      setOriginalPreview(preview);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewLoading(false);
    }
  };

  const submitText = async () => {
    await importText({ title, content, format: "text" });
    if (!useKnowledgeStudioStore.getState().error) {
      setMode("none"); setTitle(""); setContent("");
    }
  };
  const submitUrl = async () => {
    await importUrl({ url, ...(title.trim() ? { title } : {}) });
    if (!useKnowledgeStudioStore.getState().error) {
      setMode("none"); setTitle(""); setUrl("");
    }
  };
  const deleteSelectedSource = () => {
    if (!detail) return;
    const references = snapshot?.batches.filter((batch) => batch.sourceIds.includes(detail.id)) ?? [];
    const published = references.filter((batch) => batch.status === "published" || batch.artifact);
    const taskDetail = references.length > 0
      ? `\n\n同时会永久删除 ${references.length} 个关联生成任务${published.length > 0 ? `，其中 ${published.length} 个已经发布` : ""}，包括候选题、生成记录和题包文件。`
      : "";
    if (!window.confirm(`确定删除资料“${detail.title}”吗？${taskDetail}\n\n此操作无法撤销。`)) return;
    if (published.length > 0 && !window.confirm("再次确认：已发布题包也会被永久删除，删除后无法从练习题库追溯这些产物。是否继续？")) return;
    void deleteSource({ id: detail.id, deleteReferencingBatches: references.length > 0 });
  };

  if (comparisonOpen && detail) {
    return (
      <div className="knowledge-source-comparison-page">
        <header className="knowledge-comparison-toolbar">
          <button type="button" onClick={() => setComparisonOpen(false)}><ArrowLeft size={15} />返回资料库</button>
          <div><strong>{detail.title}</strong><span>源文件与切片对照</span></div>
          <span className="knowledge-format-badge">{formatLabel(detail.format)}</span>
        </header>
        <div className="knowledge-comparison-grid">
          <section className="knowledge-comparison-pane original">
            <header>
              <div><strong>源文件内容</strong><span>{originalPreview ? `${originalPreview.fileName} · ${formatBytes(originalPreview.sizeBytes)}` : "按需读取本地原文件"}</span></div>
              <span>{originalPreview?.extracted ? "提取文本" : originalPreview?.mimeType.startsWith("text/html") ? "本地快速预览 · 不重新联网" : "未清洗"}</span>
            </header>
            <div className="knowledge-original-preview">
              {previewLoading && <div className="knowledge-empty"><LoaderCircle className="spin" size={28} /><strong>正在读取源文件</strong></div>}
              {previewError && <div className="knowledge-empty error"><AlertCircle size={28} /><strong>源文件预览失败</strong><span>{previewError}</span><button type="button" onClick={() => void openComparison()}><RefreshCw size={14} />重试</button></div>}
              {!previewLoading && !previewError && originalPreview?.mode === "pdf" && pdfUrl && <iframe src={pdfUrl} title={`${detail.title} 源 PDF`} />}
              {!previewLoading && !previewError && originalPreview?.mode === "html" && originalPreview.previewUrl && (
                <iframe
                  className="knowledge-html-preview"
                  sandbox=""
                  referrerPolicy="no-referrer"
                  src={originalPreview.previewUrl}
                  title={`${detail.title} 离线网页快照`}
                />
              )}
              {!previewLoading && !previewError && originalPreview?.mode === "text" && originalPreview.mimeType.startsWith("text/html") && (
                <iframe
                  className="knowledge-html-preview"
                  sandbox=""
                  referrerPolicy="no-referrer"
                  srcDoc={htmlPreviewDocument(originalPreview.content ?? "")}
                  title={`${detail.title} 网页效果`}
                />
              )}
              {!previewLoading && !previewError && originalPreview?.mode === "text" && !originalPreview.mimeType.startsWith("text/html") && (
                <>
                  {originalPreview.extracted && <div className="knowledge-preview-note">DOCX 无法直接嵌入预览，此处展示从原文件提取的完整文本。</div>}
                  {originalPreview.truncated && <div className="knowledge-preview-note warning">原文件较大，预览仅显示前 2 MB，保存的原文件没有被截断。</div>}
                  {detail.format === "markdown" ? (
                    <div className="knowledge-markdown-preview">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        skipHtml
                        components={{
                          a: ({ children, href }) => <span className="knowledge-markdown-link" title={href}>{children}</span>,
                          img: ({ alt }) => <span className="knowledge-markdown-image">图片：{alt || "原文插图"}</span>,
                        }}
                      >{originalPreview.content ?? ""}</ReactMarkdown>
                    </div>
                  ) : <pre>{originalPreview.content}</pre>}
                </>
              )}
            </div>
          </section>
          <section className="knowledge-comparison-pane segments">
            <header>
              <div><strong>切片结果</strong><span>清洗正文 · {detail.segmentCount} 个可引用片段</span></div>
              <span>{detail.charCount.toLocaleString()} 字符</span>
            </header>
            <SourceSegments detail={detail} comparison />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="knowledge-sources-layout">
      <section className="knowledge-source-list-panel">
        <div className="knowledge-panel-heading">
          <div><span className="eyebrow">SOURCE LIBRARY</span><h2>资料库</h2></div>
          <div className="knowledge-import-menu" aria-label="导入资料">
            <button type="button" title="导入本地文件" onClick={() => void importFiles()} disabled={busy}><FolderOpen size={15} /><span>文件</span></button>
            <button type="button" title="粘贴文本" onClick={() => setMode("text")}><Plus size={15} /><span>文本</span></button>
            <button type="button" title="导入网页" onClick={() => setMode("url")}><Globe2 size={15} /><span>网页</span></button>
          </div>
        </div>
        <div className="knowledge-source-list">
          {snapshot?.sources.map((source) => (
            <button
              className={`knowledge-source-card ${selectedId === source.id ? "active" : ""}`}
              key={source.id}
              type="button"
              onClick={() => void selectSource(source.id)}
            >
              <span className="knowledge-format-badge">{formatLabel(source.format)}</span>
              <span><strong>{source.title}</strong><small>{source.charCount.toLocaleString()} 字符 · {source.segmentCount} 个片段</small></span>
              <ChevronRight size={15} />
            </button>
          ))}
          {snapshot?.sources.length === 0 && (
            <div className="knowledge-empty"><FileText size={30} /><strong>还没有资料</strong><span>导入文档、网页或粘贴文本开始构建题库。</span></div>
          )}
        </div>
      </section>

      <section className="knowledge-source-detail-panel">
        {detail ? (
          <>
            <div className="knowledge-detail-heading">
              <div><span className="eyebrow">{formatLabel(detail.format)} · {detail.kind}</span><h2>{detail.title}</h2></div>
              <div className="knowledge-actions">
                <button type="button" disabled={busy} onClick={() => void openComparison()}><Eye size={15} />预览源文件</button>
                <button className="danger-ghost" type="button" disabled={busy} onClick={deleteSelectedSource}><Trash2 size={15} />删除</button>
              </div>
            </div>
            {detail.sourceUrl && <a className="knowledge-source-url" href={detail.sourceUrl} onClick={(event) => { event.preventDefault(); void window.piDesktop.openExternal(detail.sourceUrl!); }}>{detail.sourceUrl}</a>}
            <div className="knowledge-source-meta">
              <span>SHA-256 {detail.contentHash.slice(0, 12)}</span><span>{detail.segmentCount} 个可引用片段</span>
              {(snapshot?.batches.filter((batch) => batch.sourceIds.includes(detail.id)).length ?? 0) > 0 && <span>{snapshot!.batches.filter((batch) => batch.sourceIds.includes(detail.id)).length} 个任务引用</span>}
            </div>
            <SourceSegments detail={detail} />
          </>
        ) : <div className="knowledge-empty"><FileText size={34} /><strong>选择一份资料查看解析结果</strong></div>}
      </section>

      {mode !== "none" && (
        <div className="knowledge-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMode("none"); }}>
          <section className="knowledge-modal" role="dialog" aria-modal="true">
            <header><div><Sparkles size={18} /><strong>{mode === "text" ? "粘贴文本资料" : "导入单页网页"}</strong></div><button type="button" onClick={() => setMode("none")}><X size={17} /></button></header>
            <label>资料标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={mode === "url" ? "可留空，自动读取网页标题" : "例如：Agent Memory 设计笔记"} /></label>
            {mode === "text" ? (
              <label>资料正文<textarea rows={13} value={content} onChange={(event) => setContent(event.target.value)} placeholder="粘贴 Markdown、纯文本或整理后的资料……" /></label>
            ) : (
              <label>网页地址<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/article" /></label>
            )}
            <p className="knowledge-hint">资料只保存在本机；只有创建生成任务并确认后，所选片段才会发送给模型 Provider。</p>
            <footer><button type="button" onClick={() => setMode("none")}>取消</button><button className="primary" type="button" disabled={busy || (mode === "text" ? !title.trim() || content.trim().length < 40 : !url.trim())} onClick={() => void (mode === "text" ? submitText() : submitUrl())}>{busy && <LoaderCircle className="spin" size={15} />}导入</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}

function GeneratePanel() {
  const snapshot = useKnowledgeStudioStore((state) => state.snapshot);
  const modelInfo = useKnowledgeStudioStore((state) => state.modelInfo);
  const busy = useKnowledgeStudioStore((state) => state.busy);
  const createBatch = useKnowledgeStudioStore((state) => state.createBatch);
  const [savedSelection] = useState(readSavedGenerationSources);
  const [selected, setSelected] = useState<string[]>(savedSelection ?? []);
  const [selectionReady, setSelectionReady] = useState(false);
  const [title, setTitle] = useState("Agent 面试题包");
  const [targetRole, setTargetRole] = useState("Agent / AI 应用工程师");
  const [questionCount, setQuestionCount] = useState(3);
  const [difficulty, setDifficulty] = useState<"basic" | "intermediate" | "advanced" | "mixed">("mixed");
  const [confirmed, setConfirmed] = useState(false);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [draftSelected, setDraftSelected] = useState<string[]>([]);
  const [activeAiStage, setActiveAiStage] = useState<KnowledgeAiStage>("drafts");
  const [aiSettings, setAiSettings] = useState<KnowledgeGenerationAiSettings>(() => {
    const savedModel = readSavedGenerationModel();
    return {
      ...(savedModel ? { model: savedModel } : {}),
      thinkingLevel: readSavedGenerationThinkingLevel() ?? DEFAULT_KNOWLEDGE_AI_SETTINGS.thinkingLevel,
      timeoutMs: DEFAULT_KNOWLEDGE_AI_SETTINGS.timeoutMs,
      stages: {
        drafts: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS.stages.drafts },
        answers: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS.stages.answers },
        review: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS.stages.review },
      },
    };
  });
  const [windowPreview, setWindowPreview] = useState<KnowledgeWindowPreview | null>(null);
  const [windowPreviewError, setWindowPreviewError] = useState("");
  const updateStage = (stage: KnowledgeAiStage, patch: Partial<KnowledgeGenerationAiSettings["stages"][KnowledgeAiStage]>) => {
    setAiSettings((current) => ({ ...current, stages: { ...current.stages, [stage]: { ...current.stages[stage], ...patch } } }));
  };
  const resetAiSettings = () => setAiSettings({
    thinkingLevel: DEFAULT_KNOWLEDGE_AI_SETTINGS.thinkingLevel,
    timeoutMs: DEFAULT_KNOWLEDGE_AI_SETTINGS.timeoutMs,
    stages: {
      drafts: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS.stages.drafts },
      answers: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS.stages.answers },
      review: { ...DEFAULT_KNOWLEDGE_AI_SETTINGS.stages.review },
    },
  });

  const availableSourceIds = snapshot?.sources.map((source) => source.id).join("\u0000");
  useEffect(() => {
    if (!snapshot || (snapshot.sources.length === 0 && savedSelection === null)) return;
    setSelected((current) => reconcileGenerationSources(
      selectionReady ? current : savedSelection,
      snapshot.sources.map((source) => source.id),
    ));
    setSelectionReady(true);
  }, [availableSourceIds]);

  useEffect(() => {
    if (selectionReady) saveGenerationSources(selected);
  }, [selected, selectionReady]);

  useEffect(() => {
    saveGenerationModel(aiSettings.model);
  }, [aiSettings.model?.providerId, aiSettings.model?.modelId]);

  useEffect(() => {
    saveGenerationThinkingLevel(aiSettings.thinkingLevel);
  }, [aiSettings.thinkingLevel]);

  useEffect(() => {
    if (!sourcePickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSourcePickerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sourcePickerOpen]);

  const totalChars = snapshot?.sources.filter((source) => selected.includes(source.id)).reduce((sum, source) => sum + source.charCount, 0) ?? 0;
  const selectedSources = snapshot?.sources.filter((source) => selected.includes(source.id)) ?? [];
  const visibleSources = snapshot?.sources.filter((source) => source.title.toLocaleLowerCase().includes(sourceQuery.trim().toLocaleLowerCase())) ?? [];
  const openSourcePicker = () => {
    setDraftSelected(selected);
    setSourceQuery("");
    setSourcePickerOpen(true);
  };
  const applySourceSelection = () => {
    setSelected(reconcileGenerationSources(draftSelected, snapshot?.sources.map((source) => source.id) ?? []));
    setSourcePickerOpen(false);
  };
  const toggleDraftSource = (id: string, checked: boolean) => {
    setDraftSelected((current) => {
      if (!checked) return current.filter((sourceId) => sourceId !== id);
      if (current.includes(id) || current.length >= MAX_KNOWLEDGE_BATCH_SOURCES) return current;
      return [...current, id];
    });
  };
  const activeStageSettings = aiSettings.stages[activeAiStage];
  const availableModels = modelInfo?.availableModels ?? [];
  const selectedModel = aiSettings.model
    ? availableModels.find((model) => model.providerId === aiSettings.model?.providerId && model.modelId === aiSettings.model?.modelId)
    : availableModels.find((model) => model.providerId === modelInfo?.providerId && model.modelId === modelInfo?.modelId);
  const selectedModelKey = aiSettings.model ? JSON.stringify([aiSettings.model.providerId, aiSettings.model.modelId]) : "";
  const modelSelectionValid = !aiSettings.model || Boolean(selectedModel);
  const thinkingSelectionValid = !aiSettings.thinkingLevel || aiSettings.thinkingLevel === "default"
    || Boolean(selectedModel?.reasoningLevels.includes(aiSettings.thinkingLevel));
  const selectGenerationModel = (key: string) => {
    const model = availableModels.find((item) => JSON.stringify([item.providerId, item.modelId]) === key);
    const defaultModel = availableModels.find((item) => item.providerId === modelInfo?.providerId && item.modelId === modelInfo?.modelId);
    const nextModel = model ?? defaultModel;
    setAiSettings((current) => ({
      ...current,
      model: model ? { providerId: model.providerId, modelId: model.modelId } : undefined,
      thinkingLevel: current.thinkingLevel && current.thinkingLevel !== "default" && nextModel?.reasoningLevels.includes(current.thinkingLevel)
        ? current.thinkingLevel : "default",
    }));
  };
  const validAiSettings = Number.isInteger(aiSettings.timeoutMs) && aiSettings.timeoutMs >= 10_000 && aiSettings.timeoutMs <= 300_000
    && modelSelectionValid && thinkingSelectionValid
    && (["drafts", "answers", "review"] as const).every((stage) => {
      const settings = aiSettings.stages[stage];
      return settings.additionalSystemInstruction.length <= 4_000;
    });
  const selectedKey = selected.join("\u0000");
  useEffect(() => {
    if (!selected.length || !title.trim() || !targetRole.trim() || !modelSelectionValid || !Number.isInteger(questionCount) || questionCount < 1 || questionCount > MAX_KNOWLEDGE_BATCH_QUESTIONS) {
      setWindowPreview(null);
      setWindowPreviewError("");
      return;
    }
    let cancelled = false;
    setWindowPreview(null);
    const timer = window.setTimeout(() => {
      void knowledgeStudioGateway.previewBatch({ title, targetRole, sourceIds: selected, questionCount,
        difficulty, privacyConfirmed: true, aiSettings }).then((preview) => {
        if (!cancelled) { setWindowPreview(preview); setWindowPreviewError(""); }
      }).catch((error: unknown) => {
        if (!cancelled) { setWindowPreview(null); setWindowPreviewError(error instanceof Error ? error.message : String(error)); }
      });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [selectedKey, title, targetRole, questionCount, difficulty, aiSettings, modelInfo]);
  return (
    <div className="knowledge-generate-page">
      <section className="knowledge-generation-form">
        <header className="knowledge-generation-form-header"><h2>创建题目生成任务</h2><span className="knowledge-form-source-count">{selected.length} 份资料 · {questionCount || 0} 道题</span></header>
        <div className="knowledge-generation-form-body">
          <div className="knowledge-generation-settings">
            <div className="knowledge-form-section-title"><span>01</span><div><h3>任务设置</h3><p>确定题包的范围与出题难度</p></div></div>
            <div className="knowledge-form-grid">
              <label>任务名称<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
              <label>目标岗位<input value={targetRole} onChange={(event) => setTargetRole(event.target.value)} /></label>
              <label>题目数量<input type="number" min={1} max={MAX_KNOWLEDGE_BATCH_QUESTIONS} value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} /></label>
              <label>整体难度<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}><option value="mixed">混合难度</option><option value="basic">入门</option><option value="intermediate">中级</option><option value="advanced">高级</option></select></label>
            </div>
            <section className="knowledge-generation-source-summary">
              <div className="knowledge-ai-heading"><div className="knowledge-form-section-title"><span>02</span><div><h3>事实来源</h3><p>从资料库选择生成题目的依据</p></div></div><button className="knowledge-source-select-button" type="button" onClick={openSourcePicker}><FolderOpen size={15} />选择资料</button></div>
              <div className="knowledge-selected-source-overview"><strong>{selected.length ? `已选择 ${selected.length} 份资料` : "尚未选择资料"}</strong><span>{selected.length ? `原文共 ${totalChars.toLocaleString()} 字符 · 最多 ${MAX_KNOWLEDGE_BATCH_SOURCES} 份` : "请选择至少一份资料后开始生成"}</span></div>
              {selected.length > 0 && <p className="knowledge-ai-routing-hint">这里是所选资料全文字符数；下方预览按清洗后的全部片段估算。各窗口均衡分配题数，问题规划先按每窗配额调用一次，仅在失败时拆小；答案每次最多 5 道，独立审核每次最多 10 道。实际 token 以模型用量为准。</p>}
              {selected.length > 0 && <div className="knowledge-window-preview" aria-live="polite">{!Number.isInteger(questionCount) || questionCount < 1 || questionCount > MAX_KNOWLEDGE_BATCH_QUESTIONS ? <span className="knowledge-window-preview-error">题目数量须为 1–{MAX_KNOWLEDGE_BATCH_QUESTIONS} 道</span> : windowPreview ? <><strong>预计 {windowPreview.windowCount} 个资料窗口 · 覆盖 {windowPreview.coveredSegments}/{windowPreview.availableSegments} 个片段</strong><span>资料正文约 {windowPreview.totalSourceTokens.toLocaleString()} tokens；模型容量 {windowPreview.modelContextWindowTokens.toLocaleString()} tokens（运行时元数据）</span><span>每次完整输入预算 {windowPreview.fullInputBudgetTokens.toLocaleString()} tokens（容量 70%，最高参照 258k）；提示词与 Schema 约 {windowPreview.requestOverheadTokens.toLocaleString()}，后续阶段余量 {windowPreview.planningReserveTokens.toLocaleString()}，资料净预算约 {windowPreview.sourceBudgetTokens.toLocaleString()} tokens</span><details><summary>查看各窗口预计输入与题数配额</summary><ol>{windowPreview.windows.map((item) => <li key={item.index}>窗口 {item.index}：计划 {item.plannedQuestions} 道局部候选、{item.segmentCount} 个片段、{item.sourceCount} 份资料、完整输入约 {item.estimatedInputTokens.toLocaleString()} tokens；{item.firstSegmentId}@{item.firstStartOffset} → {item.lastSegmentId}@{item.lastEndOffset}</li>)}</ol></details></> : windowPreviewError ? <span className="knowledge-window-preview-error">无法预估窗口：{windowPreviewError}</span> : <span>正在估算资料窗口和 token 预算…</span>}</div>}
              {selectedSources.length > 0 && <div className="knowledge-selected-source-chips">{selectedSources.slice(0, 3).map((source) => <span key={source.id} title={source.title}>{source.title}</span>)}{selectedSources.length > 3 && <span>另有 {selectedSources.length - 3} 份</span>}</div>}
            </section>
            <section className="knowledge-generation-ai">
              <div className="knowledge-ai-heading"><div className="knowledge-form-section-title"><span>03</span><div><h3>AI 参数设置</h3><p>配置将随任务保存，重试沿用本次参数</p></div></div><button type="button" onClick={resetAiSettings}>恢复默认</button></div>
              <div className="knowledge-ai-routing">
                <label>生成模型<select value={selectedModelKey} onChange={(event) => selectGenerationModel(event.target.value)}><option value="">跟随默认模型{modelInfo?.configured ? ` · ${modelInfo.providerId} / ${modelInfo.modelId}` : ""}</option>{aiSettings.model && !selectedModel && <option value={selectedModelKey}>上次选择的模型不可用 · {aiSettings.model.providerId} / {aiSettings.model.modelId}</option>}{availableModels.map((model) => <option key={`${model.providerId}/${model.modelId}`} value={JSON.stringify([model.providerId, model.modelId])}>{model.providerId} / {model.name === model.modelId ? model.modelId : `${model.name} (${model.modelId})`}</option>)}</select></label>
                <label>思考程度<select value={aiSettings.thinkingLevel ?? "default"} onChange={(event) => setAiSettings((current) => ({ ...current, thinkingLevel: event.target.value as KnowledgeGenerationAiSettings["thinkingLevel"] }))}><option value="default">模型默认（不指定）</option>{selectedModel?.reasoningLevels.map((level) => <option key={level} value={level}>{({ minimal: "最少", low: "低", medium: "中", high: "高", xhigh: "超高", max: "最大" } as const)[level]}</option>)}</select></label>
              </div>
              <p className="knowledge-ai-routing-hint"><Cpu size={13} />{selectedModel ? `本任务所有阶段使用 ${selectedModel.providerId} / ${selectedModel.modelId}；思考程度以模型支持情况为准。` : "未指定模型时跟随应用默认设置；非推理模型不能调整思考程度。"}</p>
              <div className="knowledge-ai-common"><label>单次请求超时（秒）<input type="number" min={10} max={300} step={10} value={aiSettings.timeoutMs / 1000} onChange={(event) => setAiSettings((current) => ({ ...current, timeoutMs: Number(event.target.value) * 1000 }))} /></label><div><strong>应用层输入预算</strong><span>{windowPreview ? `${windowPreview.fullInputBudgetTokens.toLocaleString()} tokens / 次（含系统提示词、Schema 与资料）` : "按实际模型容量动态计算；容量未知时禁止生成"}</span></div></div>
              <div className="knowledge-ai-stage-tabs" role="tablist" aria-label="模型调用阶段">{([ ["drafts", "知识点与问题"], ["answers", "答案与 Rubric"], ["review", "独立质量校验"] ] as const).map(([stage, label]) => <button key={stage} type="button" role="tab" aria-selected={activeAiStage === stage} className={activeAiStage === stage ? "active" : ""} onClick={() => setActiveAiStage(stage)}>{label}</button>)}</div>
              <div className="knowledge-ai-stage-panel" role="tabpanel">
                <p className="knowledge-ai-routing-hint">温度使用模型默认值；不设置应用层输出 token 上限，仍受模型和服务商自身限制。</p>
                <label>补充系统指令<textarea rows={2} maxLength={4000} value={activeStageSettings.additionalSystemInstruction} onChange={(event) => updateStage(activeAiStage, { additionalSystemInstruction: event.target.value })} placeholder="可选；补充出题偏好，不替换内置约束。" /></label>
                <div className="knowledge-ai-prompt-heading"><strong>本阶段完整系统提示词</strong><span>下方就是实际发送的系统指令；资料和题目作为单独输入传入</span></div>
                <pre className="knowledge-ai-prompt-content">{knowledgeSystemPrompt(activeAiStage, activeStageSettings.additionalSystemInstruction)}</pre>
                <p className="knowledge-ai-version">模板标识：{KNOWLEDGE_STUDIO_PROMPT_VERSION}（仅用于追溯修订，不是提示词正文）</p>
              </div>
              <div className="knowledge-workflow-compact">知识点与问题 <ChevronRight size={12} /> 答案与 Rubric <ChevronRight size={12} /> 质量校验 <ChevronRight size={12} /> 人工审核</div>
            </section>
          </div>
        </div>
        <footer className="knowledge-generation-form-footer"><div className="knowledge-generation-submit-row"><label className="knowledge-privacy-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>允许将所选资料发送给当前模型。资料中的指令仅作为文本处理。</span></label><button className="knowledge-generate-button" type="button" disabled={busy || (modelInfo?.configured !== true && !aiSettings.model) || selected.length === 0 || selected.length > MAX_KNOWLEDGE_BATCH_SOURCES || !title.trim() || !targetRole.trim() || !confirmed || !validAiSettings || !Number.isInteger(questionCount) || questionCount < 1 || questionCount > MAX_KNOWLEDGE_BATCH_QUESTIONS} onClick={() => void createBatch({ title, targetRole, sourceIds: selected, questionCount, difficulty, privacyConfirmed: confirmed, aiSettings })}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}开始批量生成</button></div></footer>
      </section>
      {sourcePickerOpen && <div className="knowledge-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourcePickerOpen(false); }}><section className="knowledge-source-selection-dialog" role="dialog" aria-modal="true" aria-label="选择事实来源"><header><div><span className="eyebrow">SOURCE LIBRARY</span><h2>选择事实来源</h2><p>最多 {MAX_KNOWLEDGE_BATCH_SOURCES} 份；只有确认后才更新任务选择。</p></div><button type="button" aria-label="关闭资料选择" onClick={() => setSourcePickerOpen(false)}><X size={18} /></button></header><div className="knowledge-source-picker-tools"><label className="knowledge-source-search"><Search size={16} /><input value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} placeholder="搜索资料名称" autoFocus /></label><button type="button" onClick={() => setDraftSelected(snapshot?.sources.slice(0, MAX_KNOWLEDGE_BATCH_SOURCES).map((source) => source.id) ?? [])}>全选</button><button type="button" onClick={() => setDraftSelected([])}>清空</button></div><div className="knowledge-source-picker-heading"><strong>已选 {draftSelected.length}/{MAX_KNOWLEDGE_BATCH_SOURCES}</strong><span>资料内容将在确认生成后发送给当前模型</span></div><div className="knowledge-source-picker">{visibleSources.map((source) => <label className={draftSelected.includes(source.id) ? "selected" : ""} key={source.id}><input type="checkbox" checked={draftSelected.includes(source.id)} disabled={!draftSelected.includes(source.id) && draftSelected.length >= MAX_KNOWLEDGE_BATCH_SOURCES} onChange={(event) => toggleDraftSource(source.id, event.target.checked)} /><span className="knowledge-format-badge">{formatLabel(source.format)}</span><span><strong>{source.title}</strong><small>{source.segmentCount} 个片段 · {source.charCount.toLocaleString()} 字符</small></span></label>)}{visibleSources.length === 0 && <div className="knowledge-source-picker-empty">{sourceQuery ? "没有匹配的资料" : "资料库还是空的，请先导入资料"}</div>}</div><footer><button type="button" onClick={() => setSourcePickerOpen(false)}>取消</button><button type="button" className="primary" onClick={applySourceSelection}>完成选择 · {draftSelected.length} 份</button></footer></section></div>}
    </div>
  );
}

function rubricText(items: KnowledgeRubricItem[]): string {
  return items.map((item) => `${item.weight}|${item.title}|${item.description}`).join("\n");
}

function parseRubric(value: string): KnowledgeRubricItem[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [weight, title, ...description] = line.split("|");
    return { weight: Number(weight), title: title?.trim() ?? "", description: description.join("|").trim() };
  });
}

function CandidateEditor({ candidate }: { candidate: KnowledgeQuestionCandidate }) {
  const busy = useKnowledgeStudioStore((state) => state.busy);
  const review = useKnowledgeStudioStore((state) => state.reviewCandidate);
  const [question, setQuestion] = useState(candidate.question);
  const [answer, setAnswer] = useState(candidate.answer);
  const [rubric, setRubric] = useState(rubricText(candidate.rubric));
  const [pitfalls, setPitfalls] = useState(candidate.pitfalls.join("\n"));
  const [followUps, setFollowUps] = useState(candidate.followUps.join("\n"));
  useEffect(() => {
    setQuestion(candidate.question); setAnswer(candidate.answer); setRubric(rubricText(candidate.rubric));
    setPitfalls(candidate.pitfalls.join("\n")); setFollowUps(candidate.followUps.join("\n"));
  }, [candidate.id, candidate.updatedAt]);
  const submit = (status: KnowledgeQuestionCandidate["humanStatus"]) => review({
    candidateId: candidate.id, status, question, answer, rubric: parseRubric(rubric),
    pitfalls: pitfalls.split("\n").map((item) => item.trim()).filter(Boolean),
    followUps: followUps.split("\n").map((item) => item.trim()).filter(Boolean),
  });
  return (
    <div className="knowledge-candidate-editor">
      <div className="knowledge-candidate-tags"><span>{candidate.kind}</span><span>{candidate.difficulty}</span><span>{candidate.competency}</span><span className={`validation ${candidate.validationStatus}`}>{validationLabel(candidate.validationStatus)}</span></div>
      <label>题目<textarea rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} /></label>
      <label>参考答案<textarea rows={10} value={answer} onChange={(event) => setAnswer(event.target.value)} /></label>
      <label>评分标准 <small>每行：权重|标题|说明，权重总和必须为 100</small><textarea className="rubric-editor" rows={6} value={rubric} onChange={(event) => setRubric(event.target.value)} /></label>
      <div className="knowledge-two-columns"><label>常见误区<textarea rows={5} value={pitfalls} onChange={(event) => setPitfalls(event.target.value)} /></label><label>追问<textarea rows={5} value={followUps} onChange={(event) => setFollowUps(event.target.value)} /></label></div>
      <section className="knowledge-evidence-block"><h3>原文证据</h3>{candidate.evidence.map((item) => <blockquote key={`${item.segmentId}:${item.quote}`}><strong>{item.sourceTitle}</strong><code>{item.segmentId}</code><p>{item.quote}</p></blockquote>)}{candidate.evidence.length === 0 && <p>没有可逐字匹配的证据，发布前必须人工判断。</p>}</section>
      {candidate.validationNotes.length > 0 && <section className="knowledge-validation-notes"><h3>校验记录</h3><ul>{candidate.validationNotes.map((note) => <li key={note}>{note}</li>)}</ul></section>}
      <footer><button type="button" disabled={busy} onClick={() => void submit("rejected")}><X size={15} />驳回</button><button type="button" disabled={busy} onClick={() => void submit("pending")}><RefreshCw size={15} />保存修改</button><button className="primary" type="button" disabled={busy || candidate.validationStatus === "rejected"} onClick={() => void submit("approved")}><Check size={15} />审核通过</button></footer>
    </div>
  );
}

function ReviewPanel() {
  const snapshot = useKnowledgeStudioStore((state) => state.snapshot);
  const batch = useKnowledgeStudioStore((state) => state.batch);
  const selectedBatchId = useKnowledgeStudioStore((state) => state.selectedBatchId);
  const busy = useKnowledgeStudioStore((state) => state.busy);
  const progress = useKnowledgeStudioStore((state) => state.progress);
  const selectBatch = useKnowledgeStudioStore((state) => state.selectBatch);
  const retryBatch = useKnowledgeStudioStore((state) => state.retryBatch);
  const cancelBatch = useKnowledgeStudioStore((state) => state.cancelBatch);
  const deleteBatch = useKnowledgeStudioStore((state) => state.deleteBatch);
  const publishBatch = useKnowledgeStudioStore((state) => state.publishBatch);
  const revealArtifact = useKnowledgeStudioStore((state) => state.revealArtifact);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [view, setView] = useState<"review" | "process">("review");
  const candidate = batch?.candidates.find((item) => item.id === selectedCandidateId) ?? batch?.candidates[0];
  useEffect(() => { setSelectedCandidateId(batch?.candidates[0]?.id ?? null); setView(batch && (batch.status === "queued" || batch.status === "running") ? "process" : "review"); }, [batch?.id]);
  const canPublish = batch && batch.candidates.length > 0 && batch.candidates.every((item) => item.humanStatus !== "pending") && batch.candidates.some((item) => item.humanStatus === "approved");
  const deleteSelectedBatch = () => {
    if (!batch) return;
    const publishedWarning = batch.artifact || batch.status === "published"
      ? "\n\n该任务已经发布，本地 JSON 题包也会被永久删除。"
      : "";
    if (!window.confirm(`确定删除生成任务“${batch.title}”吗？候选题、审核结果和生成记录会一并删除。${publishedWarning}\n\n此操作无法撤销。`)) return;
    void deleteBatch(batch.id);
  };
  if (batch && view === "process") return <KnowledgeGenerationProcess batch={batch} progress={progress} sources={snapshot?.sources ?? []} onBack={() => setView("review")} />;
  return (
    <div className="knowledge-review-layout">
      <aside className="knowledge-batch-list">
        <div className="knowledge-panel-heading"><div><span className="eyebrow">GENERATION RUNS</span><h2>生成任务</h2></div></div>
        {snapshot?.batches.map((item) => <button type="button" className={selectedBatchId === item.id ? "active" : ""} key={item.id} onClick={() => void selectBatch(item.id)}><span><strong>{item.title}</strong><small>{item.candidateCount}/{item.requestedQuestionCount} 题 · {item.targetRole}</small><small title={`${generationModelLabel(item)} · ${generationThinkingLabel(item)}`}>{generationModelLabel(item)} · {generationThinkingLabel(item)}</small></span><em className={item.status}>{statusLabel(item.status)}</em></button>)}
        {snapshot?.batches.length === 0 && <div className="knowledge-empty"><Sparkles size={28} /><strong>还没有生成任务</strong></div>}
      </aside>
      <header className="knowledge-review-header knowledge-review-topbar">
        {batch ? <><div className="knowledge-review-title"><span className={`knowledge-batch-status ${batch.status}`}>{statusLabel(batch.status)}</span><h2>{batch.title}</h2><p>{batch.targetRole} · 计划 {batch.requestedQuestionCount} 题 · {batch.sourceIds.length} 份资料</p><p className="knowledge-review-model-info"><Cpu size={13} />{generationModelLabel(batch)}<span>·</span>{generationThinkingLabel(batch)}</p></div><div className="knowledge-actions"><button type="button" onClick={() => setView("process")}><Sparkles size={15} />查看生成过程</button>{(batch.status === "queued" || batch.status === "running") && <button type="button" onClick={() => void cancelBatch(batch.id)}>取消生成</button>}{(batch.status === "failed" || batch.status === "cancelled") && <button type="button" onClick={() => { void retryBatch(batch.id); setView("process"); }}><RefreshCw size={15} />重新生成</button>}{batch.artifact && <button type="button" onClick={() => void revealArtifact(batch.artifact!.path)}><FolderOpen size={15} />查看题包</button>}<button className="danger-ghost" type="button" disabled={busy || batch.status === "queued" || batch.status === "running"} title={batch.status === "queued" || batch.status === "running" ? "请先取消运行中的任务" : "删除任务及题包"} onClick={deleteSelectedBatch}><Trash2 size={15} />删除</button><button className="primary" type="button" disabled={!canPublish || busy} onClick={() => void publishBatch(batch.id)}><PackageCheck size={15} />发布题包</button></div></> : <div><span className="eyebrow">GENERATION RUNS</span><h2>选择生成任务</h2></div>}
      </header>
      <section className="knowledge-review-candidates-column">
        {batch ? <>
          <header className="knowledge-candidates-heading"><div><span className="eyebrow">QUESTION CANDIDATES</span><h2>候选题</h2></div><span>{batch.candidates.length}/{batch.requestedQuestionCount}</span></header>
          <div className="knowledge-candidates-layout">
            <nav>{batch.candidates.map((item) => <button key={item.id} className={candidate?.id === item.id ? "active" : ""} type="button" onClick={() => setSelectedCandidateId(item.id)}><span>{item.ordinal + 1}</span><span><strong>{item.question}</strong><small>{validationLabel(item.validationStatus)} · {item.humanStatus === "approved" ? "已通过" : item.humanStatus === "rejected" ? "已驳回" : "待审核"}</small></span></button>)}</nav>
            <main>{candidate ? <CandidateEditor candidate={candidate} /> : <div className="knowledge-empty"><LoaderCircle size={32} /><strong>暂无候选题</strong></div>}</main>
          </div>
        </> : <div className="knowledge-generation-side-empty"><Sparkles size={24} /><strong>选择任务查看候选题</strong></div>}
      </section>
    </div>
  );
}

export function KnowledgeStudioWorkspace() {
  const initialize = useKnowledgeStudioStore((state) => state.initialize);
  const applyProgress = useKnowledgeStudioStore((state) => state.applyProgress);
  const tab = useKnowledgeStudioStore((state) => state.tab);
  const setTab = useKnowledgeStudioStore((state) => state.setTab);
  const snapshot = useKnowledgeStudioStore((state) => state.snapshot);
  const loading = useKnowledgeStudioStore((state) => state.loading);
  const error = useKnowledgeStudioStore((state) => state.error);
  const notice = useKnowledgeStudioStore((state) => state.importNotice);
  const clearError = useKnowledgeStudioStore((state) => state.clearError);
  useEffect(() => { void initialize(); }, [initialize]);
  useEffect(() => knowledgeStudioGateway.onProgress(applyProgress), [applyProgress]);
  const tabs = useMemo(() => [
    { id: "sources" as const, label: "资料库", count: snapshot?.sourceCount ?? 0, icon: FileText },
    { id: "generate" as const, label: "批量生成", count: null, icon: Sparkles },
    { id: "review" as const, label: "审核与发布", count: snapshot?.batches.length ?? 0, icon: PackageCheck },
  ], [snapshot]);
  return (
    <div className="knowledge-studio-shell">
      <header className="knowledge-studio-toolbar">
        <nav className="knowledge-tabs">{tabs.map(({ id, label, count, icon: Icon }) => <button className={tab === id ? "active" : ""} type="button" key={id} onClick={() => setTab(id)}><Icon size={16} />{label}{count !== null && <span>{count}</span>}</button>)}</nav>
        <div className="knowledge-toolbar-stats" aria-label="知识工坊统计"><span><b>{snapshot?.sourceCount ?? 0}</b> 资料</span><span><b>{snapshot?.candidateCount ?? 0}</b> 候选题</span><span><b>{snapshot?.publishedCount ?? 0}</b> 已发布</span></div>
      </header>
      {error && <div className="knowledge-global-message error"><AlertCircle size={16} /><span>{error}</span><button type="button" onClick={clearError}><X size={15} /></button></div>}
      {notice && !error && <div className="knowledge-global-message success"><Check size={16} /><span>{notice}</span></div>}
      <div className="knowledge-studio-content">{loading && !snapshot ? <div className="knowledge-empty"><LoaderCircle className="spin" size={32} /><strong>正在加载知识工坊</strong></div> : tab === "sources" ? <SourcesPanel /> : tab === "generate" ? <GeneratePanel /> : <ReviewPanel />}</div>
    </div>
  );
}
