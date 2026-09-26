import { AlertCircle, ChevronDown, Cpu, FileText, MessageSquareText, ShieldCheck } from "lucide-react";
import type { InterviewCallError, InterviewCallTrace } from "../../../shared/contracts/interview";
import type { ModelCallPhase } from "../../../platform/shared/ai/model-gateway";

type Attempt = InterviewCallTrace["attempts"][number];

const CALL_PHASES: Record<ModelCallPhase, string> = {
  request_validation: "检查请求参数", settings: "读取本地模型设置", model_resolution: "查找模型配置",
  runtime_refresh: "刷新本地模型目录", request_preparation: "组装提示词与检查预算",
  runtime_call: "等待 Pi 运行时返回（含鉴权、连接、服务处理及内部重试）",
  response_validation: "校验模型响应与用量",
};

const DIAGNOSES: Record<string, { meaning: string; next: string }> = {
  LOCAL_DEADLINE: { meaning: "本地总时限到期，应用已中止等待。此时没有完成整个调用。",
    next: "先查看耗时停在哪个阶段；若主要耗时在 Pi 运行时，可检查连接与服务状态，再考虑降低思考深度或增加总时限。" },
  UPSTREAM_TIMEOUT: { meaning: "Pi 运行时或上游返回超时错误；不是本地总时限触发。未提供更细的网络阶段。",
    next: "检查模型服务、代理和网络状态；仅增大应用总时限未必能解决底层超时。" },
  HEADER_TIMEOUT: { meaning: "底层报告等待 HTTP 响应头超时。", next: "检查服务端响应速度及代理链路。" },
  CONNECT_TIMEOUT: { meaning: "底层报告建立连接超时。", next: "检查网络、代理和服务地址的可达性。" },
  BODY_TIMEOUT: { meaning: "底层报告读取响应体超时。", next: "检查流式连接是否中断、代理是否限制长连接，以及服务端是否停止发送数据。" },
  DNS_FAILURE: { meaning: "底层报告域名解析失败。", next: "检查 DNS、网络和代理配置。" },
  CONNECTION_REFUSED: { meaning: "目标连接被拒绝。", next: "检查代理或目标服务是否启动、端口是否正确。" },
  CONNECTION_RESET: { meaning: "连接被重置。", next: "检查代理、网络稳定性和上游服务状态。" },
  TLS_FAILURE: { meaning: "TLS 证书校验失败。", next: "检查系统时间、证书及代理证书配置。" },
  WEBSOCKET_FAILURE: { meaning: "错误信息涉及 WebSocket，具体原因未进一步确认。", next: "检查代理是否支持 WebSocket 以及连接是否被关闭。" },
  FETCH_FAILED: { meaning: "底层网络请求失败，未提供更具体原因。", next: "检查网络与代理；当前证据无法定位到 DNS、连接或服务端。" },
  UNSUPPORTED_PARAMETER: { meaning: "模型服务拒绝了请求参数。", next: "检查所选模型支持的参数。" },
  CONTEXT_LIMIT: { meaning: "输入超过模型允许的上下文范围。", next: "缩短历史或资料，或选择上下文容量更大的模型。" },
};

function FailureDiagnosis({ attempt }: { attempt: Attempt }) {
  const error = attempt.error;
  if (!error) return null;
  const diagnosis = error.diagnosticCode ? DIAGNOSES[error.diagnosticCode] : undefined;
  const fallback: Record<string, { meaning: string; next: string }> = {
    timeout: { meaning: "请求超时；该记录未保存超时来源，无法区分本地总时限和底层超时。",
      next: "用更新后的版本重试一次以采集阶段信息；历史记录无法补回缺失的诊断。" },
    authentication_failed: { meaning: "模型服务鉴权失败。", next: "检查登录是否过期，以及模型服务凭据是否有效。" },
    permission_denied: { meaning: "模型服务拒绝访问。", next: "检查账号是否有权使用所选模型。" },
    rate_limited: { meaning: "模型服务限制了请求频率。", next: "按服务建议的等待时间重试，或减少并发请求。" },
    quota_exceeded: { meaning: "模型服务额度不足。", next: "检查账号可用额度。" },
    cancelled: { meaning: "调用被取消。", next: "确认取消操作或任务状态后再重试。" },
    not_configured: { meaning: "未找到可用的模型配置。", next: "检查服务商、模型选择及本地配置。" },
    invalid_request: { meaning: "请求参数被拒绝。", next: "检查失败阶段、模型支持范围及请求配置。" },
    budget_exceeded: { meaning: "请求或实际用量超过预算限制。", next: "检查输入长度、输出上限及预算配置。" },
    content_blocked: { meaning: "模型服务拦截了本次内容。", next: "检查请求内容与服务返回的限制。" },
    provider_unavailable: { meaning: "模型服务或连接不可用。", next: "结合 HTTP 状态和诊断码检查服务、网络及代理。" },
  };
  const validation = error.stage && ["json_syntax", "json_schema", "business_validation", "output_length"].includes(error.stage)
    ? FAILURE_STAGES[error.stage] : undefined;
  const explanation = diagnosis ?? (validation
    ? { meaning: error.stage === "output_length" ? "模型输出达到长度限制，响应可能不完整。" : `输出未通过${validation}。`,
      next: "查看字段错误、失败原文和后续格式修复记录。" }
    : fallback[error.code] ?? { meaning: "本次调用失败，现有信息不足以确认根因。", next: "查看下方阶段、错误码及原文记录。" });
  return <div className="interview-call-trace-diagnosis">
    <p><strong>已知情况：</strong>{explanation.meaning}</p>
    {attempt.diagnostics && <p><strong>最后阶段：</strong>{CALL_PHASES[attempt.diagnostics.phase]}</p>}
    <p><strong>排查方向：</strong>{explanation.next}</p>
    {error.code === "timeout" && <p>当前接口不提供首字节、生成进度和实际内部重试次数；不能据此断言是服务排队、模型思考过慢或网络阻塞。超时不会触发 JSON 格式修复重试。</p>}
  </div>;
}

function CallDiagnostics({ attempt }: { attempt: Attempt }) {
  const call = attempt.diagnostics;
  if (!call) return <p>阶段诊断：此记录未采集详细时间线和运行时参数。</p>;
  return <details className="interview-call-diagnostics" open={Boolean(attempt.error)}>
    <summary>请求阶段与实际参数</summary>
    <div className="interview-call-trace-facts">
      <span>应用总时限：{call.totalTimeoutMs === undefined ? "未进入计时" : `${call.totalTimeoutMs / 1000} 秒`}</span>
      <span>传入 Pi 的超时：{call.runtimeTimeoutMs === undefined ? "未记录" : `${call.runtimeTimeoutMs / 1000} 秒`}</span>
      <span>WebSocket 连接超时：{call.websocketConnectTimeoutMs === undefined ? (call.model ? "运行时默认" : "未进入运行时") : `${call.websocketConnectTimeoutMs / 1000} 秒`}</span>
      <span>传入 Pi 的重试上限：{call.providerMaxRetries ?? (call.model ? "运行时默认" : "未进入运行时")}（实际次数未提供）</span>
      {call.maxRetryDelayMs !== undefined && <span>重试等待上限：{call.maxRetryDelayMs / 1000} 秒</span>}
      {call.estimatedInputTokens !== undefined && <span>输入估算：{call.estimatedInputTokens.toLocaleString()} tokens（非服务端计数）</span>}
      {call.inputTextCharacters !== undefined && <span>输入字符：{call.inputTextCharacters.toLocaleString()}（含网关协议）</span>}
      <span>传入的输出上限：{call.maxOutputTokens ?? (call.model ? "运行时默认" : "未进入运行时")}</span>
    </div>
    <p>运行时返回：{call.runtimeResponseReceived ? "已收到消息（可能包含服务错误，以结束原因和校验结果为准）" : "未取得最终消息；不代表底层未收到任何数据"}</p>
    {call.timeoutSource && <p>超时来源：{call.timeoutSource === "local_deadline" ? "应用总时限" : "Pi 运行时或上游"}</p>}
    <ol>{call.timeline.map((entry, index) => <li key={`${index}-${entry.phase}`}>
      +{(entry.elapsedMs / 1000).toFixed(3)} 秒 · {CALL_PHASES[entry.phase]} · 耗时 {((
        (call.timeline[index + 1]?.elapsedMs ?? call.elapsedMs) - entry.elapsedMs) / 1000).toFixed(3)} 秒
      {index === call.timeline.length - 1 && ` · ${call.outcome === "failed" ? "在此失败" : call.outcome === "succeeded" ? "网关完成" : "最后记录"}`}
    </li>)}</ol>
    <p>总时限覆盖本地准备与运行时调用；运行时超时参数的具体作用由 Provider 决定。一次网关调用可能包含内部重试。</p>
  </details>;
}

const FAILURE_STAGES: Record<NonNullable<InterviewCallError["stage"]>, string> = {
  request: "请求配置或预算检查", provider: "模型服务或网络请求", json_syntax: "JSON 语法校验",
  json_schema: "JSON 字段结构校验", business_validation: "业务规则校验",
  output_length: "输出达到长度限制", unknown: "未确定",
};

const STEP_LABELS: Record<InterviewCallTrace["messages"][number]["kind"], string> = {
  system_prompt: "系统提示词",
  job_description: "目标岗位资料（非候选人发言）",
  resume: "候选人简历（资料，非发言）",
  history: "历史对话",
  candidate_message: "候选人本轮回答",
  candidate_control: "本轮模拟控制（程序消息，非面试官发言）",
  topic_control: "面试进度、考察记录与当前任务（程序消息）",
  instruction: "程序任务与审查信息",
  score_material: "评分输入（岗位、简历与对话 JSON）",
};

const COLLAPSED_MESSAGE_KINDS = new Set<InterviewCallTrace["messages"][number]["kind"]>([
  "system_prompt", "job_description", "resume",
]);

type TraceMessageEntry = { message: InterviewCallTrace["messages"][number]; index: number };
type DisplayMessage = { kind: "single"; entry: TraceMessageEntry }
  | { kind: "history_group"; entries: TraceMessageEntry[] };

function groupMessagesForDisplay(trace: InterviewCallTrace): DisplayMessage[] {
  const grouped: DisplayMessage[] = [];
  trace.messages.forEach((message, index) => {
    const previous = grouped.at(-1);
    if (message.kind === "history"
      || (trace.actor === "interviewer" && message.kind === "candidate_message"
        && previous?.kind === "history_group")) {
      if (previous?.kind === "history_group") previous.entries.push({ message, index });
      else grouped.push({ kind: "history_group", entries: [{ message, index }] });
    } else grouped.push({ kind: "single", entry: { message, index } });
  });
  return grouped;
}

function duration(startedAt: string, finishedAt: string): string {
  const elapsed = Date.parse(finishedAt) - Date.parse(startedAt);
  return Number.isFinite(elapsed) && elapsed >= 0 ? `${(elapsed / 1_000).toFixed(1)} 秒` : "—";
}

export function InterviewTraceDetails({ trace }: { trace: InterviewCallTrace }) {
  if (trace.actor === "candidate_gate") {
    let value: { questionTurnId?: string; errorRate?: number; draw?: number; mode?: string; errorKind?: string } = {};
    try { value = JSON.parse(trace.outputText ?? "{}") as typeof value; } catch { /* Keep raw output visible below. */ }
    return <details className="interview-call-trace succeeded">
      <summary><MessageSquareText size={14} /><span>查看程序抽签详情</span><small>0 次模型调用</small><ChevronDown size={13} /></summary>
      <div className="interview-call-trace-body">
        <p>该决定由本地程序在调用模拟候选人模型前作出，只发送模式控制给候选人 Agent；面试官、导演和评分 Agent 不会收到抽签记录。相同问题重试会复用这次结果。</p>
        <div className="interview-call-trace-facts"><span>问题 ID：{value.questionTurnId ?? "—"}</span>
          <span>设定概率：{value.errorRate ?? "—"}%</span><span>随机值：{value.draw ?? "—"} / 1,000,000</span>
          <span>模式：{value.mode === "mistake" ? "技术误答" : "正常回答"}</span>
          {value.mode === "mistake" && <span>类型：{value.errorKind === "slip" ? "紧张口误" : "认知偏差"}</span>}</div>
      </div>
    </details>;
  }
  const lastAttempt = trace.attempts.at(-1);
  const displayMessages = groupMessagesForDisplay(trace);
  return <details className={`interview-call-trace ${trace.status}`}>
    <summary><MessageSquareText size={14} /><span>{trace.actor === "score" ? "查看评分调用过程" : "查看本轮调用过程"}</span>
      <small>{trace.messages.length} 条消息 · {trace.attempts.length} 次模型调用</small><ChevronDown size={13} /></summary>
    <div className="interview-call-trace-body">
      {lastAttempt?.error && <section className="interview-call-trace-attempts">
        <h4><AlertCircle size={14} />失败定位 · 第 {trace.attempts.length} 次调用</h4>
        <FailureDiagnosis attempt={lastAttempt} />
      </section>}
      <p className="interview-call-trace-note"><ShieldCheck size={14} />{trace.actor === "score"
        ? "这是面试结束后的独立评分请求：系统消息是评分规则，user 消息是包含岗位、简历与可见对话的 JSON 资料，不是候选人新发言。下方先展示初次调用的消息；格式重试通过追加 user 消息提供具体错误和失败原文，并在对应尝试下单独列出。Provider 适配器可能再做协议转换。"
        : trace.actor === "candidate"
          ? "以下是初次请求进入模型网关的消息顺序。历史会话仅在界面合并，展开后逐条保留原始正文；界面序号不进入模型，role 是实际请求的消息元数据。候选人系统提示词固定；逐轮误答控制作为最后一条程序 user 消息发送，不是面试官发言。JSON 自报仅供调试，只有 answer 会进入可见对话；格式重试指令另附在对应尝试下。"
          : "以下是初次请求进入模型网关的消息顺序，不是逐条发送的网络请求。历史会话仅在界面合并，展开后逐条保留原始正文；界面序号不进入模型，role 是实际请求的消息元数据。稳定的开场与追问规则写在系统消息里；逐轮话题状态及导演控制追加在对话末尾的程序 user 消息中，不是候选人发言。JSON 格式重试的追加 user 修复消息在对应尝试下列出；不会展示模型未返回的内部思考。"}</p>
      <div className="interview-call-trace-facts">
        <span>选择模型：{trace.requestedModel.providerId} / {trace.requestedModel.modelId}</span>
        <span>思考深度：{trace.reasoning === "default" ? "模型默认" : trace.reasoning}</span>
        <span>超时：{Math.round(trace.timeoutMs / 1_000)} 秒</span>
        {trace.maxInputTokens !== undefined && <span>历史版本输入预算：{trace.maxInputTokens.toLocaleString()} tokens</span>}
        <span>总耗时：{duration(trace.startedAt, trace.finishedAt)}</span>
        {trace.candidateOutcome && <span>候选人 JSON 自报：{trace.candidateOutcome.mistakeMade ? "已实施技术误答" : "未实施技术误答"}</span>}
      </div>
      <ol className="interview-call-trace-steps">
        {displayMessages.map((item) => {
          if (item.kind === "history_group") {
            const firstIndex = item.entries[0].index;
            const characters = item.entries.reduce((total, entry) => total + entry.message.content.length, 0);
            return <li key={`history-${firstIndex}`}>
              <details className="interview-call-trace-history">
                <summary><span>{firstIndex + 1}</span><strong>历史对话</strong>
                  <small>界面分组 · {item.entries.length} 条原始消息</small><em>{characters.toLocaleString()} 字符</em><ChevronDown size={13} /></summary>
                <div className="interview-call-trace-history-messages">
                  {item.entries.map(({ message, index }) => <section key={index}>
                    <header>界面标识 · 请求第 {index + 1} 条　|　请求角色（消息元数据）：{message.role}</header>
                    <pre>{message.content}</pre>
                  </section>)}
                </div>
              </details>
            </li>;
          }
          const { message, index } = item.entry;
          const heading = <><span>{index + 1}</span><strong>{STEP_LABELS[message.kind]}</strong>
            <small>{message.role}</small><em>{message.content.length.toLocaleString()} 字符</em></>;
          return <li key={`${index}-${message.kind}`}>
            {COLLAPSED_MESSAGE_KINDS.has(message.kind)
              ? <details className="interview-call-trace-static-message">
                <summary>{heading}<ChevronDown size={13} /></summary>
                <pre>{message.content}</pre>
              </details>
              : <><header>{heading}</header><pre>{message.content}</pre></>}
          </li>;
        })}
      </ol>
      <section className="interview-call-trace-attempts">
        <h4><Cpu size={14} />模型调用</h4>
        {trace.attempts.length === 0 && <p>请求在调用模型前失败。</p>}
        {trace.attempts.map((attempt, index) => <article key={`${index}-${attempt.startedAt}`}>
          <header><strong>第 {index + 1} 次 · {attempt.providerId} / {attempt.modelId}</strong><small>{duration(attempt.startedAt, attempt.finishedAt)}</small></header>
          <p>开始：{attempt.startedAt} · 结束：{attempt.finishedAt}</p>
          {attempt.error && <>
            <p className="error"><AlertCircle size={13} />{attempt.error.code} · {attempt.error.message}</p>
            <p>失败阶段：{attempt.error.stage ? FAILURE_STAGES[attempt.error.stage] : "旧记录未保存"}
              {attempt.error.statusCode !== undefined && <> · HTTP {attempt.error.statusCode}</>}
              {attempt.error.diagnosticCode && <> · {attempt.error.diagnosticCode}</>}
              {attempt.error.retryable !== undefined && <> · 网关判定可重试：{attempt.error.retryable ? "是（不表示已自动重试）" : "否"}</>}
              {attempt.error.retryAfterMs !== undefined && <> · 建议等待 {attempt.error.retryAfterMs} 毫秒</>}</p>
            {attempt.error.validationIssues?.length ? <ul>{attempt.error.validationIssues.map((issue, issueIndex) =>
              <li key={issueIndex}>{issue}</li>)}</ul> : null}
          </>}
          {attempt.error && index !== trace.attempts.length - 1 && <FailureDiagnosis attempt={attempt} />}
          <p>本地调用 ID：{attempt.requestId ?? "未记录"} · 结束原因：{attempt.finishReason ?? "未记录"}
              {attempt.providerStopReason && <> · 原始结束原因：{attempt.providerStopReason}</>}
              {attempt.usage && <> · 输入 {attempt.usage.inputTokens ?? "—"} / 输出 {attempt.usage.outputTokens ?? "—"} tokens
                {attempt.usage.reasoningTokens !== undefined && ` · 思考 ${attempt.usage.reasoningTokens} tokens`}
                {attempt.usage.durationMs !== undefined && ` · 网关耗时 ${(attempt.usage.durationMs / 1_000).toFixed(1)} 秒`}
                {attempt.usage.costUsd !== undefined && ` · 费用 $${attempt.usage.costUsd.toFixed(6)}`}</>}</p>
          <CallDiagnostics attempt={attempt} />
          {attempt.retryInstruction && <details><summary>本次格式修复指令</summary><pre>{attempt.retryInstruction}</pre></details>}
          {attempt.error && (attempt.outputText !== undefined
            ? <details><summary>失败调用的模型原文（仅供诊断）</summary><pre>{attempt.outputText || "（模型返回了空文本）"}</pre></details>
            : <p>{attempt.diagnostics
              ? "未记录模型原文：本次未取得运行时最终消息，无法判断是否曾收到部分数据。"
              : "未记录模型原文：可能尚未收到响应，或来自未保存原文的旧版本。"}</p>)}
        </article>)}
      </section>
      {trace.outputText && <section className="interview-call-trace-output"><h4><FileText size={14} />模型输出</h4><pre>{trace.outputText}</pre></section>}
      {trace.deliveryNote && <p className="interview-call-trace-note"><ShieldCheck size={14} />{trace.deliveryNote}</p>}
      {trace.error && <p className="interview-call-trace-error"><AlertCircle size={14} />{trace.error.code} · {trace.error.message}</p>}
      {lastAttempt?.usage?.costUsd !== undefined && <p className="interview-call-trace-cost">本轮费用（Provider 报告）：${lastAttempt.usage.costUsd.toFixed(6)}</p>}
    </div>
  </details>;
}
