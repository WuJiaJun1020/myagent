import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Brain, Check, ChevronDown, CircleCheck, CircleDotDashed, CircleX, Cpu, Download, FileInput, FileOutput, ListChecks, Sparkles } from "lucide-react";
import {
  DEFAULT_KNOWLEDGE_AI_SETTINGS,
  knowledgeSystemPrompt,
  type KnowledgeGenerationBatch,
  type KnowledgeGenerationEvent,
  type KnowledgeGenerationProgress,
  type KnowledgeSourceSummary,
} from "../../../shared/contracts/knowledge-studio";

type CallItem = { kind: "call"; key: string; request: KnowledgeGenerationEvent; events: KnowledgeGenerationEvent[]; prepared?: KnowledgeGenerationEvent; result?: KnowledgeGenerationEvent };
type ActivityItem = { kind: "activity"; key: string; event: KnowledgeGenerationEvent };
type StoryItem = CallItem | ActivityItem;

const STAGE_LABELS: Record<KnowledgeGenerationEvent["stage"], string> = {
  queued: "准备任务", extracting: "知识点与问题规划", answering: "答案、评分与证据",
  validating: "独立质量校验", review: "等待人工审核", published: "已发布",
  failed: "任务失败", cancelled: "任务取消",
};
const PURPOSE_LABELS = { drafts: "规划问题", answers: "生成答案", review: "质量校验" } as const;
const PROMPT_STAGES = ["extracting", "answering", "validating"] as const;
const SCHEMA_EXPLANATIONS = {
  drafts: "items 必须恰好有计划题数项；每项包含序号 ordinal、能力点 competency、题型 kind、难度 difficulty、题目 question、来源片段 ID 列表 evidenceSegmentIds。此阶段不生成答案。",
  answers: "items 必须恰好有本次批量题数项；每项包含 ordinal、参考答案 answer、评分项 rubric、常见误区 pitfalls、追问 followUps 和逐字引文 evidence。300 字与口语化由后续本地验收，不是 Schema 自身保证。",
  review: "items 必须恰好有待审核题数项；每项包含 ordinal、审核结论 verdict（supported / needs_review / rejected）和说明 notes。",
} as const;

function clock(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function pretty(value: string): string {
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

function inputSummary(value: string): string {
  try {
    const input = JSON.parse(value) as Record<string, unknown>;
    const sources = Array.isArray(input.sources) ? input.sources : [];
    const drafts = Array.isArray(input.drafts) ? input.drafts : [];
    const questions = Array.isArray(input.questions) ? input.questions : [];
    const parts = [sources.length > 0 ? `${sources.length} 个资料片段` : "", drafts.length > 0 ? `${drafts.length} 道待回答问题` : "", questions.length > 0 ? `${questions.length} 道待校验题目` : ""];
    return parts.filter(Boolean).join(" · ") || `${value.length.toLocaleString()} 字符`;
  } catch { return `${value.length.toLocaleString()} 字符`; }
}

function outputSummary(value: string): string {
  try {
    const data = JSON.parse(value) as Record<string, unknown>;
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length > 0) return `${items.length} 条结果 · ${items.slice(0, 2).map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      return String(record.question ?? record.answer ?? record.verdict ?? "").slice(0, 48);
    }).filter(Boolean).join("；")}`;
  } catch { /* The raw response is still available below. */ }
  return `${value.length.toLocaleString()} 字符`;
}

function sourceContentCharacters(value: string): number | undefined {
  try {
    const payload = JSON.parse(value) as Record<string, unknown>;
    if (!Array.isArray(payload.sources)) return undefined;
    return payload.sources.reduce<number>((sum, source) => {
      if (!source || typeof source !== "object") return sum;
      const content = (source as Record<string, unknown>).content;
      return sum + (typeof content === "string" ? content.length : 0);
    }, 0);
  } catch { return undefined; }
}

function actualInputTokens(usage: KnowledgeGenerationEvent["usage"]): number | undefined {
  if (usage?.inputTokens === undefined && usage?.cachedInputTokens === undefined) return undefined;
  return (usage.inputTokens ?? 0) + (usage.cachedInputTokens ?? 0);
}

function inputCharacterRatio(characters: number | undefined, tokens: number | undefined): string | undefined {
  if (characters === undefined || tokens === undefined || tokens <= 0) return undefined;
  return (characters / tokens).toFixed(2);
}

export function buildGenerationStory(events: KnowledgeGenerationEvent[]): StoryItem[] {
  const story: StoryItem[] = [];
  const openCalls = new Map<string, CallItem>();
  for (const event of events) {
    const details = event.details;
    if (!details || details.kind !== "model-call") { story.push({ kind: "activity", key: `event-${event.id}`, event }); continue; }
    const callKey = details.callId ?? `${details.purpose}-legacy`;
    if (details.phase === "request") {
      const call: CallItem = { kind: "call", key: `call-${event.id}`, request: event, events: [event] };
      story.push(call);
      openCalls.set(callKey, call);
      continue;
    }
    const call = openCalls.get(callKey);
    if (call) {
      call.events.push(event);
      if (details.phase === "prepared") call.prepared = event;
      if (details.phase === "stream" || details.phase === "response" || details.phase === "error") call.result = event;
      if (details.phase === "response" || details.phase === "error") openCalls.delete(callKey);
    } else {
      story.push({ kind: "call", key: `call-${event.id}`, request: event, events: [event], result: event });
    }
  }
  return story;
}

function storyStage(item: StoryItem): KnowledgeGenerationEvent["stage"] {
  return item.kind === "call" ? item.request.stage : item.event.stage;
}

function ModelCallCard({ call, ordinal, isLatest }: { call: CallItem; ordinal: number; isLatest: boolean }) {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [outputExpanded, setOutputExpanded] = useState(false);
  const [failedExpanded, setFailedExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(isLatest);
  useEffect(() => { if (!isLatest) setDetailsExpanded(false); }, [isLatest]);
  const request = call.request.details!;
  const prepared = call.prepared?.details;
  const result = call.result?.details;
  const failed = result?.phase === "error";
  const complete = result?.phase === "response";
  const showDetails = failed ? failedExpanded : detailsExpanded;
  const modelEvent = call.events.find((event) => event.providerId && event.modelId);
  const model = modelEvent?.providerId && modelEvent.modelId ? `${modelEvent.providerId} / ${modelEvent.modelId}` : "尚未解析模型";
  const usage = call.result?.usage;
  const sourceCharacters = useMemo(() => sourceContentCharacters(request.userPayload ?? ""), [request.userPayload]);
  const inputCharacters = prepared?.inputTextCharacters;
  const inputTokens = actualInputTokens(usage);
  const ratio = inputCharacterRatio(inputCharacters, inputTokens);
  const contextWindow = prepared?.modelContextWindowTokens;
  const contextInputTokens = inputTokens ?? prepared?.estimatedInputTokens;
  const contextInputPercent = contextWindow && contextInputTokens !== undefined
    ? Math.round(contextInputTokens / contextWindow * 1000) / 10 : undefined;
  const output = result?.responseText ? pretty(result.responseText) : "";
  const effectivePrompt = prepared?.effectiveSystemPrompt ?? request.systemPrompt;
  const phaseLabels: Record<string, string> = { request: "客户端组装请求", prepared: "网关解析模型与预算", stream: "接收流式内容", response: "模型回复并通过结构校验", error: "调用失败" };
  return <article className={`knowledge-story-call ${failed ? "failed" : ""}`}>
    <header><div className="knowledge-story-call-heading"><span className="knowledge-story-call-icon"><Sparkles size={17} /></span><div><small>第 {ordinal} 次模型调用{request.windowLabel ? ` · 资料窗口 ${request.windowLabel}` : ""}</small><h3>{request.purpose ? PURPOSE_LABELS[request.purpose] : "模型调用"}</h3></div></div><span className={`knowledge-story-call-status ${failed ? "failed" : complete ? "complete" : "running"}`}>{failed ? "调用失败" : complete ? "已完成" : "处理中"}</span></header>
    <div className="knowledge-story-call-meta"><span><Cpu size={13} />{model}</span><span>{clock(call.request.createdAt)}{call.result ? ` → ${clock(call.result.createdAt)}` : ""}</span>{result?.elapsedMs !== undefined && <span>{(result.elapsedMs / 1000).toFixed(1)} 秒</span>}{result?.requestId && <span title={result.requestId}>请求 ID：{result.requestId}</span>}{result?.finishReason && <span>结束原因：{result.finishReason}</span>}</div>
    <div className="knowledge-story-call-token-summary" aria-label="本次模型调用用量"><span>资料正文 <strong>{sourceCharacters === undefined ? "未记录" : `${sourceCharacters.toLocaleString()} 字符`}</strong></span><span title="系统提示词、输出协议和用户输入中的可见文本字符数；不是 HTTP 请求字节数">输入文本 <strong>{inputCharacters === undefined ? (complete || failed ? "未记录" : "待网关统计") : `${inputCharacters.toLocaleString()} 字符`}</strong></span><span>预计输入 <strong>{prepared?.estimatedInputTokens === undefined ? (complete || failed ? "未记录" : "待网关估算") : `${prepared.estimatedInputTokens.toLocaleString()} tokens`}</strong></span><span title="模型返回的普通输入 token 与缓存输入 token 之和">实际输入 <strong>{inputTokens === undefined ? (complete || failed ? "未返回" : "待模型返回") : `${inputTokens.toLocaleString()} tokens`}</strong></span><span>实际输出 <strong>{usage?.outputTokens === undefined ? (complete || failed ? "未返回" : "待模型返回") : `${usage.outputTokens.toLocaleString()} tokens`}</strong></span></div>
    {result?.error && <div className="knowledge-story-call-error"><AlertCircle size={15} /><span><strong>{result.error}</strong><small>错误类型：{result.errorCode ?? "未知"}{result.diagnosticCode ? ` · 诊断 ${result.diagnosticCode}` : ""}{result.statusCode ? ` · HTTP ${result.statusCode}` : ""} · {result.retryable ? "可重试" : "不可重试"}</small>{result.validationIssues?.map((issue, index) => <small key={index}>{issue}</small>)}</span></div>}
    {failed && <button className="knowledge-story-call-expand" type="button" aria-expanded={failedExpanded} onClick={() => setFailedExpanded((current) => !current)}>{failedExpanded ? "收起失败调用详情" : "查看失败调用详情"}<ChevronDown size={13} /></button>}
    {!failed && <button className="knowledge-story-call-expand" type="button" aria-expanded={detailsExpanded} onClick={() => setDetailsExpanded((current) => !current)}>{detailsExpanded ? "收起调用详情" : `查看调用详情 · ${result?.responseText ? outputSummary(result.responseText) : inputSummary(request.userPayload ?? "")}`}<ChevronDown size={13} /></button>}
    {showDetails && <>
      <section className="knowledge-story-step"><div className="knowledge-story-step-label"><FileInput size={16} /><strong>请求档案</strong><small>{inputSummary(request.userPayload ?? "")}</small></div><p>系统指令与资料 JSON 属于同一次调用；这里的 Schema 是提示词约束与本地校验，不是供应商原生结构化输出参数。</p>
        <div className="knowledge-debug-facts"><span>配置超时 {request.timeoutMs ? Math.round(request.timeoutMs / 1000) : "?"} 秒</span><span>生效超时 {prepared?.effectiveTimeoutMs ? Math.round(prepared.effectiveTimeoutMs / 1000) : "未记录"} 秒</span><span>应用输入预算 {request.maxInputTokens?.toLocaleString() ?? "?"} tokens</span><span>输入估算 {prepared?.estimatedInputTokens?.toLocaleString() ?? "未记录"} tokens</span><span>模型上下文 {contextWindow === undefined ? "未记录" : `${contextWindow.toLocaleString()} tokens`}</span>{contextInputPercent !== undefined && <span>{inputTokens === undefined ? "预计" : "实际"}输入约占上下文 {contextInputPercent}%（不含输出）</span>}{ratio && <span>输入文本平均约 {ratio} 字符 / 实际输入 token</span>}{usage?.cachedInputTokens !== undefined && <span>缓存输入 {usage.cachedInputTokens.toLocaleString()} tokens（已计入实际输入）</span>}{usage?.reasoningTokens !== undefined && <span>推理 {usage.reasoningTokens.toLocaleString()} tokens</span>}<span>应用层输出上限 {request.maxOutputTokens === undefined ? "未设置（仍受模型限制）" : `${request.maxOutputTokens.toLocaleString()} tokens`}</span><span>思考程度 {prepared?.reasoning ?? request.reasoning ?? "模型默认"}</span><span>温度 {prepared?.temperatureApplied === false ? "模型默认（未发送）" : prepared?.effectiveTemperature ?? request.temperature ?? "模型默认（未指定）"}</span><span>内部重试上限 {prepared?.providerMaxRetries ?? "未记录"}</span></div>
        <p>字符数按 JavaScript 字符串长度统计，与当前资料截断口径一致，不是 HTTP 字节数。网关估算按 ASCII 约 4 字符/token、非 ASCII 约 1 字符/token 计算；实际 token 以模型返回用量为准。各阶段是独立调用，不共享聊天上下文；失败或超时可能没有实际用量。</p>
        <details><summary>查看系统指令{prepared?.effectiveSystemPrompt ? "（网关最终组合）" : "（仅应用模板，旧记录未保存网关追加内容）"} <ChevronDown size={13} /></summary><pre>{effectivePrompt ?? "未记录"}</pre></details>
        {request.jsonSchema && <details><summary>查看输出 JSON Schema · {request.schemaName} <ChevronDown size={13} /></summary><pre>{JSON.stringify(request.jsonSchema, null, 2)}</pre></details>}
        <details><summary>查看完整用户 JSON（含资料原文） <ChevronDown size={13} /></summary><pre>{pretty(request.userPayload ?? "")}</pre></details>
      </section>
      <section className="knowledge-story-step"><div className="knowledge-story-step-label"><ListChecks size={16} /><strong>可观察的执行轨迹</strong><small>{call.events.length} 条事件</small></div><details><summary>展开时间点 <ChevronDown size={13} /></summary><ol className="knowledge-debug-event-list">{call.events.map((event) => <li key={event.id}><time>{clock(event.createdAt)}</time><span>{phaseLabels[event.details?.phase ?? ""] ?? event.message}</span><small>{event.details?.phase === "stream" ? `输出 ${event.details.responseText?.length ?? 0} 字符 · 思考 ${event.details.reasoningText?.length ?? 0} 字符` : event.message}</small></li>)}</ol></details><p>“网关已准备”不等于供应商已收到；没有网络层回执时不推断送达时间。</p></section>
      <section className="knowledge-story-step thinking"><div className="knowledge-story-step-label"><Brain size={16} /><strong>模型可展示的思考</strong>{result?.reasoningText && <small>{result.reasoningText.length.toLocaleString()} 字符</small>}</div>{result?.reasoningText ? <><button className="knowledge-story-toggle" type="button" aria-expanded={thinkingExpanded} onClick={() => setThinkingExpanded((current) => !current)}>{thinkingExpanded ? "收起思考过程" : "展开思考过程"}<ChevronDown size={13} /></button>{thinkingExpanded && <div className="knowledge-story-reasoning">{result.reasoningText}</div>}</> : <p>{complete ? "供应商未返回可展示的思考文本；无法还原其内部推理。" : "如果供应商返回可展示的思考内容，会显示在这里。"}</p>}</section>
      {result?.responseText && <section className="knowledge-story-step output"><div className="knowledge-story-step-label"><FileOutput size={16} /><strong>模型输出</strong><small>{outputSummary(result.responseText)}</small></div>{outputExpanded ? <pre className="knowledge-story-output-full">{output}</pre> : <pre className="knowledge-story-output-preview">{output.slice(0, 400)}{output.length > 400 ? "…" : ""}</pre>}{output.length > 400 && <button className="knowledge-story-toggle" type="button" aria-expanded={outputExpanded} onClick={() => setOutputExpanded((current) => !current)}>{outputExpanded ? "收起完整输出" : "展开完整输出"}<ChevronDown size={13} /></button>}<details><summary>查看原始响应文本 <ChevronDown size={13} /></summary><pre>{result.responseText}</pre></details></section>}
    </>}
  </article>;
}

function ActivityCard({ event }: { event: KnowledgeGenerationEvent }) {
  const [selectionQuery, setSelectionQuery] = useState("");
  const selection = event.details?.selection;
  const windowPlan = event.details?.windowPlan;
  const validation = event.details?.validation;
  const query = selectionQuery.trim().toLocaleLowerCase();
  const visibleSources = selection?.sources.filter((source) => !query || `${source.title} ${source.sourceId}`.toLocaleLowerCase().includes(query)) ?? [];
  const visibleSegments = selection?.segments.filter((segment) => !query || `${segment.id} ${segment.heading ?? ""}`.toLocaleLowerCase().includes(query)) ?? [];
  return <article className={`knowledge-story-activity ${event.state}`}>
    {event.state === "completed" ? <CircleCheck size={17} /> : event.state === "failed" ? <CircleX size={17} /> : <CircleDotDashed size={17} />}
    <div className="knowledge-story-activity-content">
      <time>{clock(event.createdAt)}</time>
      {selection && <strong>资料选片</strong>}
      {windowPlan && <strong>资料分窗计划</strong>}
      {validation && <strong>{validation.label}</strong>}
      <span className="knowledge-story-activity-message">{event.message}</span>
      {validation && <span className={`knowledge-debug-validation-badge ${validation.passed ? "passed" : "failed"}`}>{validation.passed ? "通过" : "未通过"}</span>}
      {selection && <details className="knowledge-debug-activity-details"><summary>查看选片详情 <ChevronDown size={13} /></summary><p>按{selection.order}；可用 {selection.availableSegments} 片，纳入 {selection.selectedSegments} 片，共 {selection.selectedCharacters.toLocaleString()} 字符。{selection.maxContextChars ? `旧任务字符上限 ${selection.maxContextChars.toLocaleString()}。` : "本任务没有字符截断上限。"}</p><input className="knowledge-debug-search" value={selectionQuery} onChange={(inputEvent) => setSelectionQuery(inputEvent.target.value)} placeholder="搜索资料名、片段标题或 ID" aria-label="搜索本地选片记录" /><div className="knowledge-debug-source-list">{visibleSources.map((source) => <div key={source.sourceId}><strong>{source.title}</strong><span>纳入 {source.included}/{source.available} 片 · {source.includedCharacters.toLocaleString()} 字符</span></div>)}</div><details><summary>查看实际纳入的 {visibleSegments.length}/{selection.segments.length} 个片段</summary><ol className="knowledge-debug-segments">{visibleSegments.map((segment) => <li key={segment.id}><span>#{selection.segments.indexOf(segment) + 1} {segment.heading || segment.id}</span><small>{segment.id} · {segment.includedCharacters}/{segment.originalCharacters} 字符{segment.includedCharacters < segment.originalCharacters ? " · 已截断" : ""}</small></li>)}</ol></details></details>}
      {windowPlan && <details className="knowledge-debug-activity-details"><summary>查看完整分窗预算 <ChevronDown size={13} /></summary><p>模型容量 {windowPlan.modelContextWindowTokens.toLocaleString()} tokens（运行时元数据）；调用硬预算 {windowPlan.fullInputBudgetTokens.toLocaleString()}{windowPlan.packingTargetTokens < windowPlan.fullInputBudgetTokens ? `；失败重排打包目标 ${windowPlan.packingTargetTokens.toLocaleString()}` : ""}；提示词与 Schema 约 {windowPlan.requestOverheadTokens.toLocaleString()}；后续阶段余量 {windowPlan.planningReserveTokens.toLocaleString()}；资料净预算约 {windowPlan.sourceBudgetTokens.toLocaleString()}。预计覆盖 {windowPlan.coveredSegments}/{windowPlan.availableSegments} 个片段，资料正文约 {windowPlan.totalSourceTokens.toLocaleString()} tokens。</p><ol>{windowPlan.windows.map((item) => <li key={item.index}>窗口 {item.index}：{item.plannedQuestions === undefined ? "" : `计划 ${item.plannedQuestions} 道局部候选 · `}{item.sourceCount} 份资料 · {item.segmentCount} 个片段 · 完整输入约 {item.estimatedInputTokens.toLocaleString()} tokens · 正文 {item.characters.toLocaleString()} 字符 · {item.firstSegmentId}@{item.firstStartOffset} → {item.lastSegmentId}@{item.lastEndOffset}</li>)}</ol></details>}
      {validation && validation.issues.length > 0 && <details className="knowledge-debug-validation-issues"><summary>查看 {validation.issues.length} 条检查说明 <ChevronDown size={13} /></summary><ul>{validation.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></details>}
    </div>
  </article>;
}

function PromptLibrary({ batch, sources }: { batch: KnowledgeGenerationBatch; sources: KnowledgeSourceSummary[] }) {
  const sourceNames = new Map(sources.map((source) => [source.id, source.title]));
  const settings = batch.aiSettings ?? DEFAULT_KNOWLEDGE_AI_SETTINGS;
  return <section className="knowledge-story-prompts"><h3>本次生成配置</h3><dl><div><dt>目标岗位</dt><dd>{batch.targetRole}</dd></div><div><dt>计划题数</dt><dd>{batch.requestedQuestionCount} 道</dd></div><div><dt>来源资料</dt><dd>{batch.sourceIds.length} 份</dd></div><div><dt>模型选择</dt><dd>{settings.model ? `${settings.model.providerId} / ${settings.model.modelId}` : "跟随应用默认"}</dd></div><div><dt>思考程度</dt><dd>{settings.thinkingLevel && settings.thinkingLevel !== "default" ? settings.thinkingLevel : "模型默认"}</dd></div><div><dt>实际模型</dt><dd>{batch.providerId && batch.modelId ? `${batch.providerId} / ${batch.modelId}` : "见调用卡片"}</dd></div></dl><details><summary><span>查看所选资料</span><small>{batch.sourceIds.length} 份</small></summary><ol>{batch.sourceIds.map((id) => <li key={id}>{sourceNames.get(id) ?? id}</li>)}</ol></details><h3>阶段提示词与输出协议</h3><p>这里展示每阶段的共用模板与 Schema。每次调用的最终消息和生效参数在对应调用卡片中。</p>{PROMPT_STAGES.map((stage) => {
    const actual = [...batch.events].reverse().find((event) => event.stage === stage && event.details?.phase === "request")?.details;
    const prepared = [...batch.events].reverse().find((event) => event.stage === stage && event.details?.phase === "prepared"
      && event.details.callId === actual?.callId)?.details;
    const purpose = stage === "extracting" ? "drafts" : stage === "answering" ? "answers" : "review";
    const template = actual?.systemPrompt ?? knowledgeSystemPrompt(purpose, settings.stages[purpose].additionalSystemInstruction);
    return <details key={stage}><summary><span>{STAGE_LABELS[stage]}</span><small>{actual ? `${actual.promptVersion ?? "已记录"} · ${actual.schemaName ?? "旧记录"}` : "配置模板 · 尚未调用"}</small></summary><p className="knowledge-story-prompt-settings">{SCHEMA_EXPLANATIONS[purpose]} 当前是提示词约束 + 本地 Schema 校验，并非供应商原生结构化输出。</p><strong className="knowledge-debug-subheading">应用系统提示词</strong><pre>{template}</pre>{prepared?.effectiveSystemPrompt && <><strong className="knowledge-debug-subheading">网关最终组合的系统提示词</strong><pre>{prepared.effectiveSystemPrompt}</pre></>}{actual?.jsonSchema && <><strong className="knowledge-debug-subheading">完整 JSON Schema · {actual.schemaName}</strong><pre>{JSON.stringify(actual.jsonSchema, null, 2)}</pre></>}</details>;
  })}</section>;
}

export function KnowledgeGenerationProcess({ batch, progress, sources, onBack }: { batch: KnowledgeGenerationBatch; progress: KnowledgeGenerationProgress | null; sources: KnowledgeSourceSummary[]; onBack: () => void }) {
  const story = useMemo(() => buildGenerationStory(batch.events), [batch.events]);
  const feedRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(batch.status === "queued" || batch.status === "running");
  const currentProgress = progress?.batchId === batch.id ? progress.progress : batch.progress;
  const callCount = story.filter((item) => item.kind === "call").length;
  const callsWithUsage = story.filter((item): item is CallItem => item.kind === "call" && actualInputTokens(item.result?.usage) !== undefined);
  const callsWithoutUsage = story.filter((item) => item.kind === "call" && (item.result?.details?.phase === "response" || item.result?.details?.phase === "error") && actualInputTokens(item.result?.usage) === undefined).length;
  const totalInputTokens = callsWithUsage.reduce((sum, item) => sum + (actualInputTokens(item.result?.usage) ?? 0), 0);
  const totalOutputTokens = callsWithUsage.reduce((sum, item) => sum + (item.result?.usage?.outputTokens ?? 0), 0);
  const latestCallKey = [...story].reverse().find((item) => item.kind === "call")?.key;
  const exportDiagnostics = () => {
    if (!window.confirm("诊断记录包含所选资料原文、系统提示词及模型输出。确认保存到本地文件吗？请勿直接分享未经检查的文件。")) return;
    // Only the module's recorded fields are exported. Provider credentials and HTTP headers are never captured here.
    const payload = { format: "knowledge-studio-diagnostics.v1", exportedAt: new Date().toISOString(),
      batch: { id: batch.id, title: batch.title, targetRole: batch.targetRole, sourceIds: batch.sourceIds,
        requestedQuestionCount: batch.requestedQuestionCount, difficulty: batch.difficulty,
        aiSettings: batch.aiSettings, status: batch.status, error: batch.error }, events: batch.events };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `knowledge-studio-${batch.id}-diagnostics.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  useEffect(() => { setFollow(batch.status === "queued" || batch.status === "running"); feedRef.current?.scrollTo({ top: 0 }); }, [batch.id]);
  useEffect(() => { if (follow) feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight }); }, [batch.id, story.length, follow]);
  return <div className="knowledge-story-page">
    <header className="knowledge-story-header"><button type="button" onClick={onBack}><ArrowLeft size={16} />返回审核与发布</button><div><span className="eyebrow">GENERATION WORKSPACE</span><h2>{batch.title}</h2><p>{STAGE_LABELS[progress?.batchId === batch.id ? progress.stage : batch.stage]} · {currentProgress}%</p></div><button type="button" onClick={exportDiagnostics} title="记录含资料原文，不包含供应商密钥或 HTTP 鉴权头"><Download size={15} />导出诊断</button><span className={`knowledge-batch-status ${batch.status}`}>{batch.status === "review" ? "待审核" : batch.status === "running" ? "生成中" : batch.status === "failed" ? "失败" : batch.status === "published" ? "已发布" : "等待中"}</span></header>
    <div className="knowledge-story-progress"><span style={{ width: `${currentProgress}%` }} /></div>
    <div className="knowledge-story-layout"><main className="knowledge-story-feed" ref={feedRef} onScroll={(event) => { const target = event.currentTarget; setFollow(target.scrollHeight - target.scrollTop - target.clientHeight < 80); }}><div className="knowledge-story-feed-head"><div><span className="eyebrow">EXECUTION LOG</span><h3>生成实录</h3><p>本地选片不调用模型；第一张调用卡同时携带系统指令和资料 JSON。失败尝试默认收起，可按需查看。</p></div><span className="knowledge-story-feed-count">{callCount} 次应用层模型调用 · {batch.events.length} 条记录{callsWithUsage.length > 0 && <small>已返回 {callsWithUsage.length} 次用量：实际输入 {totalInputTokens.toLocaleString()} / 输出 {totalOutputTokens.toLocaleString()} tokens（独立调用逐次相加）</small>}{callsWithoutUsage > 0 && <small>{callsWithoutUsage} 次调用未返回实际用量</small>}</span></div>
      {callCount === 0 && <div className="knowledge-story-legacy"><AlertCircle size={18} /><span><strong>该任务没有保存调用级记录</strong><small>目前只能看到阶段状态，无法还原输入、模型输出或思考内容。需使用更新后的主进程重新生成；旧记录不能补录。</small></span></div>}
      <div className="knowledge-story-stream">{story.map((item, index) => {
        const stage = storyStage(item);
        const startsStage = index === 0 || stage !== storyStage(story[index - 1]!);
        return <Fragment key={item.key}>
          {startsStage && <div className="knowledge-story-stage-heading"><span className="knowledge-story-stage-mark" /><strong>{STAGE_LABELS[stage]}</strong></div>}
          {item.kind === "call"
            ? <ModelCallCard call={item} ordinal={story.slice(0, index + 1).filter((entry) => entry.kind === "call").length} isLatest={item.key === latestCallKey} />
            : <ActivityCard event={item.event} />}
        </Fragment>;
      })}{story.length === 0 && <div className="knowledge-story-awaiting"><Sparkles size={22} />等待执行记录…</div>}</div>
      {batch.error && <div className="knowledge-story-failure"><AlertCircle size={17} /><span><strong>任务失败</strong>{batch.error}</span></div>}
      {(batch.status === "review" || batch.status === "published") && <div className="knowledge-story-done"><Check size={17} />生成完成，可返回审核候选题。</div>}
    </main><aside className="knowledge-story-sidebar"><PromptLibrary batch={batch} sources={sources} /></aside></div>
  </div>;
}
