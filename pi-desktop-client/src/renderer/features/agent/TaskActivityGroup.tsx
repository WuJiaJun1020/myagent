import { ChevronDown, CircleAlert, LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AgentMessage } from "../../../shared/contracts/agent-events";
import type { ToolCallState } from "../../lib/event-reducer";
import { useUiStore } from "../../stores/ui-store";
import { resolveToolRenderer, ToolCategoryIcon, ToolDetailRenderer } from "../tools/ToolRenderer";

import { MarkdownContent } from "../chat/MarkdownContent";

export type TaskActivityItem =
  | { type: "assistant"; messageId: string }
  | { type: "final-thinking"; messageId: string }
  | { type: "tool"; toolId: string };

type TaskActivityGroupProps = {
  items: TaskActivityItem[];
  messagesById: Record<string, AgentMessage>;
  toolCallsById: Record<string, ToolCallState>;
  startedAt: number;
  endedAt?: number;
  settled: boolean;
};

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 1) return `${seconds}秒`;
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 1) return `${minutes}分 ${String(seconds).padStart(2, "0")}秒`;
  return `${hours}时 ${String(minutes).padStart(2, "0")}分 ${String(seconds).padStart(2, "0")}秒`;
}

export function groupActivityItems(items: TaskActivityItem[]): Array<TaskActivityItem | { type: "tools"; toolIds: string[] }> {
  const groups: Array<TaskActivityItem | { type: "tools"; toolIds: string[] }> = [];
  for (const item of items) {
    const previous = groups.at(-1);
    if (item.type !== "tool") groups.push(item);
    else if (previous?.type === "tools") previous.toolIds.push(item.toolId);
    else groups.push({ type: "tools", toolIds: [item.toolId] });
  }
  return groups;
}

function ToolActivity({ tools }: { tools: ToolCallState[] }) {
  const selectToolCall = useUiStore(state => state.selectToolCall);
  const [expanded, setExpanded] = useState(false);
  if (!tools.length) return null;
  if (tools.length === 1) return <InlineToolCall tool={tools[0]} onInspect={() => selectToolCall(tools[0].id)} />;
  const running = tools.some(tool => tool.status === "running");
  const failed = tools.filter(tool => tool.status === "error").length;
  const labels = [...new Set(tools.map(tool => {
    const category = resolveToolRenderer(tool).present(tool).category;
    return ({ terminal: "运行命令", read: "读取文件", edit: "编辑文件", search: "搜索", generic: `调用 ${tool.name}` })[category];
  }))];
  return <div className="task-tool-group">
    <button className="task-operation-toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      {running ? <LoaderCircle size={15} className="spin" /> : <ToolCategoryIcon category={resolveToolRenderer(tools[0]).present(tools[0]).category} />}
      <span>{running ? "正在" : "已"}{labels.join("、")}</span>
      {failed > 0 && <em className="error">{failed} 项失败</em>}
      <ChevronDown size={13} className={expanded ? "open" : ""} />
    </button>
    {expanded && <div className="task-tool-calls">{tools.map(tool => <InlineToolCall key={tool.id} tool={tool} onInspect={() => selectToolCall(tool.id)} />)}</div>}
  </div>;
}

function InlineToolCall({ tool, onInspect }: { tool: ToolCallState; onInspect: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const presentation = resolveToolRenderer(tool).present(tool);
  const action = ({ terminal: "运行命令", read: "读取文件", edit: "编辑文件", search: "搜索", generic: `调用 ${tool.name}` })[presentation.category];
  return <div className={`task-inline-call ${tool.status}`}>
    <button className="task-call-toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      {tool.status === "running" ? <LoaderCircle size={15} className="spin" /> : <ToolCategoryIcon category={presentation.category} />}
      <span>{tool.status === "running" ? "正在" : tool.status === "error" ? "失败：" : "已"}{action} · {presentation.summary}</span>
      <ChevronDown size={13} className={expanded ? "open" : ""} />
    </button>
    {expanded && <div className="task-inline-detail">
      <header><span>{presentation.category === "terminal" ? "Shell" : tool.name}</span><button type="button" onClick={onInspect}>在检查器中查看</button></header>
      <div className="task-inline-output"><ToolDetailRenderer tool={tool} compact /></div>
    </div>}
  </div>;
}

export function TaskActivityGroup({ items, messagesById, toolCallsById, startedAt, endedAt, settled }: TaskActivityGroupProps) {
  const [expanded, setExpanded] = useState(!settled);
  const manuallyToggled = useRef(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!manuallyToggled.current) setExpanded(!settled); }, [settled]);
  useEffect(() => {
    if (settled) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [settled]);
  const failedCount = items.filter(item => item.type === "tool" && toolCallsById[item.toolId]?.status === "error").length;
  const duration = formatDuration((endedAt ?? now) - startedAt);
  return <section className={`task-activity ${expanded ? "expanded" : "collapsed"} ${settled ? "settled" : "running"}`}>
    <button className="task-activity-toggle" type="button" aria-expanded={expanded} onClick={() => { manuallyToggled.current = true; setExpanded(value => !value); }}>
      {!settled && <LoaderCircle className="spin" size={14} />}
      <span>{settled ? `用时 ${duration}` : `正在处理 · ${duration}`}</span>
      <ChevronDown size={14} className={expanded ? "open" : ""} />
      {failedCount > 0 && <em className="error"><CircleAlert size={12} />{failedCount} 项失败</em>}
    </button>
    {expanded && <div className="task-activity-items">{groupActivityItems(items).map(item => {
      if (item.type === "tools") return <ToolActivity key={`tools:${item.toolIds[0]}`} tools={item.toolIds.map(id => toolCallsById[id]).filter((tool): tool is ToolCallState => Boolean(tool))} />;
      if (item.type === "tool") return null;
      const message = messagesById[item.messageId];
      if (!message) return null;
      return <div className="task-message-activity" key={`${item.type}:${message.id}`}>
        {message.content.map(block => {
          if (block.type === "thinking") return <details className="task-thinking-row" key={block.contentIndex}>
            <summary><Sparkles size={14} /><span>{message.streaming ? "正在思考" : "思考"}</span><ChevronDown size={13} /></summary>
            <div className="task-thinking-content">{block.redacted ? "该思考内容已由模型提供方隐藏。" : block.text || "等待思考内容…"}</div>
          </details>;
          if (item.type === "assistant" && block.type === "text" && block.text) return <div className="task-process-note" key={block.contentIndex}>{message.streaming ? block.text : <MarkdownContent content={block.text} />}</div>;
          return null;
        })}
        {item.type === "assistant" && message.errorMessage && <div className="message-error"><CircleAlert size={14} />{message.errorMessage}</div>}
      </div>;
    })}</div>}
  </section>;
}
