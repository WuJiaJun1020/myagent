import { Check, ChevronDown, ChevronRight, CircleAlert, LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { AgentMessage } from "../../../shared/contracts/agent-events";
import type { ToolCallState } from "../../lib/event-reducer";
import { useUiStore } from "../../stores/ui-store";
import { resolveToolRenderer, ToolCategoryIcon } from "../tools/ToolRenderer";

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

function ThinkingRows({ message }: { message: AgentMessage }) {
  const blocks = message.content.filter((block) => block.type === "thinking");
  return blocks.map((block) => (
    <details className="task-thinking-row" key={block.contentIndex}>
      <summary><Sparkles size={13} /><span>思考</span><ChevronRight size={13} /></summary>
      <p>{block.redacted ? "该思考内容已由模型提供方隐藏。" : block.text}</p>
    </details>
  ));
}

export function TaskActivityGroup({
  items,
  messagesById,
  toolCallsById,
  startedAt,
  endedAt,
  settled,
}: TaskActivityGroupProps) {
  const [expanded, setExpanded] = useState(!settled);
  const [now, setNow] = useState(Date.now());
  const selectToolCall = useUiStore((state) => state.selectToolCall);

  useEffect(() => {
    setExpanded(!settled);
  }, [settled]);

  useEffect(() => {
    if (settled) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [settled]);

  const tools = items
    .filter((item): item is Extract<TaskActivityItem, { type: "tool" }> => item.type === "tool")
    .map((item) => toolCallsById[item.toolId])
    .filter((tool): tool is ToolCallState => Boolean(tool));
  const thinkingCount = items.reduce((count, item) => {
    if (item.type === "tool") return count;
    return count + (messagesById[item.messageId]?.content.filter((block) => block.type === "thinking").length ?? 0);
  }, 0);
  const failedCount = tools.filter((tool) => tool.status === "error").length;
  const runningCount = tools.filter((tool) => tool.status === "running").length;
  const duration = formatDuration((endedAt ?? now) - startedAt);

  return (
    <section className={`task-activity ${expanded ? "expanded" : "collapsed"} ${settled ? "settled" : "running"}`}>
      <button
        className="task-activity-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {settled ? <Sparkles size={14} /> : <LoaderCircle className="spin" size={14} />}
        <strong>{settled ? `用时 ${duration}` : `正在处理 · ${duration}`}</strong>
        <span>
          {thinkingCount > 0 && `思考 ${thinkingCount} 次`}
          {thinkingCount > 0 && tools.length > 0 && " · "}
          {tools.length > 0 && `运行 ${tools.length} 个工具`}
        </span>
        {failedCount > 0 && <em className="error"><CircleAlert size={12} />{failedCount}</em>}
        {failedCount === 0 && runningCount === 0 && tools.length > 0 && <em className="done"><Check size={12} />{tools.length}</em>}
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {expanded && (
        <div className="task-activity-items">
          {items.map((item, index) => {
            if (item.type === "tool") {
              const tool = toolCallsById[item.toolId];
              if (!tool) return null;
              const presentation = resolveToolRenderer(tool).present(tool);
              const statusIcon = tool.status === "running"
                ? <LoaderCircle className="spin" size={12} />
                : tool.status === "error"
                  ? <CircleAlert size={12} />
                  : <Check size={12} />;
              return (
                <button
                  className={`task-tool-row ${tool.status}`}
                  type="button"
                  key={`${tool.id}:${index}`}
                  onClick={() => selectToolCall(tool.id)}
                  title="在右侧检查器中查看完整调用信息"
                >
                  <ToolCategoryIcon category={presentation.category} />
                  <span><strong>{tool.status === "running" ? "正在运行" : "已运行"} {presentation.label}</strong><small>{presentation.summary}</small></span>
                  {statusIcon}
                </button>
              );
            }

            const message = messagesById[item.messageId];
            if (!message) return null;
            const text = item.type === "assistant"
              ? message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n\n")
              : "";
            return (
              <div className="task-message-activity" key={`${item.type}:${message.id}:${index}`}>
                <ThinkingRows message={message} />
                {text && <p className="task-process-note">{text}</p>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
