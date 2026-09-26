import { AlertCircle, Bug, ChevronDown, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { InterviewCallTrace, InterviewTopicFlow } from "../../../shared/contracts/interview";
import type { InterviewCallGroup, InterviewCallEntry } from "./interview-call-groups";
import { InterviewTraceDetails } from "./InterviewTraceDetails";

function decisionLabel(trace: InterviewCallTrace): string {
  try {
    const value = JSON.parse(trace.outputText ?? "") as { action?: string; reason?: string };
    const action = value.action === "pass" ? "放行" : value.action === "correct" ? "要求纠错"
      : value.action === "redirect" ? "要求换题" : value.action === "close" ? "要求收尾" : "已审查";
    return `${action}${value.reason ? `：${value.reason}` : ""}`;
  } catch { return "审查结果可展开查看。"; }
}

function gateLabel(trace: InterviewCallTrace): string {
  try {
    const value = JSON.parse(trace.outputText ?? "") as { mode?: string; errorRate?: number; errorKind?: string };
    return value.mode === "mistake"
      ? `抽中技术误答（${value.errorKind === "slip" ? "口误" : "认知偏差"}），设定概率 ${value.errorRate}%`
      : `正常回答，设定误答概率 ${value.errorRate}%`;
  } catch { return "程序已决定本轮模式。"; }
}

function entryTitle(entry: InterviewCallEntry, group: InterviewCallGroup): string {
  const trace = entry.trace;
  if (entry.id.startsWith("turn:")) {
    if (group.entries.some((item) => item.trace.actor === "director")) {
      return trace.operationId.includes(":revision")
        ? "面试官改写草稿（最终采用）" : "面试官草稿（导演放行后发送）";
    }
    return "面试官最终发送";
  }
  if (trace.actor === "candidate_gate") return "模拟候选人模式抽签";
  if (trace.actor === "candidate") return "模拟候选人回答";
  if (trace.actor === "score") return "面试评分";
  if (trace.actor === "director") return trace.operationId.includes(":director-verify-")
    ? "面试导演复核" : "面试导演审查";
  if (trace.operationId.endsWith(":draft")) return "面试官未发送草稿";
  return trace.status === "failed" ? "面试官调用失败" : "面试官调用";
}

function entrySummary(trace: InterviewCallTrace): string {
  if (trace.error) return trace.error.message;
  if (trace.actor === "candidate_gate") return gateLabel(trace);
  if (trace.deliveryNote) return trace.deliveryNote;
  if (trace.actor === "director") return decisionLabel(trace);
  return `${trace.messages.length} 条消息 · ${trace.attempts.length} 次模型调用`;
}

export function InterviewCallDrawer({ groups, selectedId, onSelect, onClose, showSummaries, onToggleSummaries, topicFlow }: {
  groups: InterviewCallGroup[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  showSummaries: boolean;
  onToggleSummaries: () => void;
  topicFlow?: InterviewTopicFlow;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const group = groups.find((item) => item.id === selectedId) ?? groups.at(-1);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab") return;
      const controls = drawerRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), select:not([disabled]), a[href], summary, [tabindex]:not([tabindex='-1'])");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);
  if (!group) return null;
  return createPortal(<div className="interview-call-drawer-layer">
    <button type="button" className="interview-call-drawer-backdrop" onClick={onClose} aria-label="关闭调试记录" />
    <aside className="interview-call-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label="面试调用记录">
      <header className="interview-call-drawer-header">
        <div><span className="eyebrow">DEBUG TRACE</span><h2>面试调用记录</h2><p>默认对话视图只显示交流内容；这里保留完整请求与审查过程。</p></div>
        <button type="button" ref={closeRef} onClick={onClose} aria-label="关闭调试记录"><X size={18} /></button>
      </header>
      <div className="interview-call-drawer-toolbar">
        <label>查看轮次 <span><select value={group.id} onChange={(event) => onSelect(event.target.value)}>
          {groups.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.entries.length} 条记录</option>)}
        </select><ChevronDown size={14} /></span></label>
        <button type="button" className={showSummaries ? "active" : ""} aria-pressed={showSummaries} onClick={onToggleSummaries}>
          <Bug size={14} />{showSummaries ? "隐藏对话摘要" : "在对话中显示摘要"}
        </button>
      </div>
      <div className="interview-call-drawer-scroll">
        {topicFlow && <details className="interview-call-topic-flow">
          <summary>话题段落与考察记录（本场最新状态）</summary>
          <div><strong>当前段落：</strong>{topicFlow.blocks.find((block) => block.status === "active")?.anchor ?? "已结束"}</div>
          <div><strong>已考察：</strong>{topicFlow.coverage.length ? topicFlow.coverage.map((item) => item.label).join("、") : "尚无回答证据"}</div>
          <div><strong>待考察岗位重点：</strong>{topicFlow.pendingRoleAbilities?.length
            ? topicFlow.pendingRoleAbilities.map((item) => item.label).join("、") : "无"}</div>
          <ol>{topicFlow.blocks.map((block) => <li key={block.id}>
            {block.anchor} · {block.source === "resume" ? "简历经历" : block.source === "role" ? "岗位能力" : "基础知识"}
            · 第 {block.questionRounds.join("、")} 问 · {block.status === "active" ? "进行中" : `已结束（${block.exitReason ?? "自然转向"}）`}
          </li>)}</ol>
        </details>}
        <div className="interview-call-drawer-overview"><strong>{group.label}</strong><span>{group.entries.length} 个步骤 · {group.modelCalls} 次模型调用
          {group.hasFailure ? " · 含失败记录" : ""}</span></div>
        {group.entries.map((entry, index) => <section className={`interview-call-drawer-entry ${entry.trace.status}`} key={entry.id}>
          <header><span>{index + 1}</span><div><strong>{entryTitle(entry, group)}</strong><small>{entrySummary(entry.trace)}</small></div>
            {entry.trace.status === "failed" && <AlertCircle size={16} />}</header>
          <InterviewTraceDetails trace={entry.trace} />
        </section>)}
      </div>
    </aside>
  </div>, document.body);
}
