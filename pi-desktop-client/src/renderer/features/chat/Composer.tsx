import {
  ChevronDown,
  CircleGauge,
  CornerDownLeft,
  MessageCircle,
  Paperclip,
  Send,
  ShieldCheck,
  Square,
  Terminal,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import type { SessionMode, SlashCommand, ThinkingLevel } from "../../../shared/contracts/agent-session";
import { agentGateway } from "../../services/agent-gateway";
import { useAgentStore } from "../../stores/agent-store";
import { useSessionStore } from "../../stores/session-store";

type ComposerCommand = Omit<SlashCommand, "source"> & {
  source: SlashCommand["source"] | "desktop";
  usage?: string;
};

const DESKTOP_COMMANDS: ComposerCommand[] = [
  { name: "new", description: "创建新会话", source: "desktop", usage: "[work|chat]" },
  { name: "chat", description: "切换到纯聊天模式", source: "desktop" },
  { name: "work", description: "切换到工作模式", source: "desktop" },
  { name: "name", description: "重命名当前会话", source: "desktop", usage: "<名称>" },
  { name: "compact", description: "压缩当前上下文", source: "desktop", usage: "[附加要求]" },
  { name: "thinking", description: "设置 Thinking Level", source: "desktop", usage: "<level>" },
  { name: "model", description: "切换模型", source: "desktop", usage: "<provider/model>" },
  { name: "abort", description: "停止当前任务", source: "desktop" },
];

const sourceLabels: Record<ComposerCommand["source"], string> = {
  desktop: "桌面端",
  extension: "扩展",
  prompt: "模板",
  skill: "技能",
};

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return (tokens / 1_000_000).toFixed(1) + "M";
  if (tokens >= 1_000) return (tokens / 1_000).toFixed(tokens >= 10_000 ? 0 : 1) + "K";
  return String(tokens);
}

export function Composer() {
  const [input, setInput] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const status = useAgentStore((state) => state.processStatus);
  const busy = useAgentStore((state) => state.busy);
  const error = useAgentStore((state) => state.error);
  const setError = useAgentStore((state) => state.setError);
  const session = useSessionStore((state) => state.session);
  const commands = useSessionStore((state) => state.commands);
  const thinkingLevels = useSessionStore((state) => state.thinkingLevels);
  const sessionMutation = useSessionStore((state) => state.mutation);
  const createSession = useSessionStore((state) => state.createSession);
  const renameSession = useSessionStore((state) => state.renameSession);
  const setSessionMode = useSessionStore((state) => state.setSessionMode);
  const setApprovalPolicy = useSessionStore((state) => state.setApprovalPolicy);
  const selectModel = useSessionStore((state) => state.selectModel);
  const selectThinkingLevel = useSessionStore((state) => state.selectThinkingLevel);
  const refreshSessionState = useSessionStore((state) => state.refreshSessionState);
  const sessionReady = session !== null && sessionMutation === null;
  const chatMode = session?.mode === "chat";
  const canSend = input.trim().length > 0 && status.state === "running" && sessionReady;
  const commandQuery = input.startsWith("/") && !input.slice(1).includes(" ")
    ? input.slice(1).toLowerCase()
    : null;
  const availableCommands = useMemo<ComposerCommand[]>(() => {
    const merged: ComposerCommand[] = [...commands, ...DESKTOP_COMMANDS];
    const unique = new Map(merged.map((command) => [command.name, command]));
    return [...unique.values()]
      .filter((command) => commandQuery !== null && command.name.toLowerCase().includes(commandQuery))
      .slice(0, 8);
  }, [commands, commandQuery]);
  const context = session?.contextUsage;
  const contextPercent = context?.percent === null || context?.percent === undefined
    ? null
    : Math.max(0, Math.min(100, context.percent));

  async function executeDesktopCommand(command: string, args: string): Promise<boolean> {
    if (!session) return false;
    switch (command) {
      case "new": {
        if (args && args !== "chat" && args !== "work") throw new Error("用法：/new [work|chat]");
        const mode: SessionMode = args === "chat" ? "chat" : args === "work" ? "work" : session.mode;
        await createSession(mode);
        return true;
      }
      case "chat":
        await setSessionMode("chat");
        return true;
      case "work":
        await setSessionMode("work");
        return true;
      case "name":
        if (!args) throw new Error("用法：/name <会话名称>");
        await renameSession(session.id, args);
        return true;
      case "compact":
        await agentGateway.compact(args || undefined);
        await refreshSessionState();
        return true;
      case "thinking":
        if (!thinkingLevels.includes(args as ThinkingLevel)) {
          throw new Error("可用级别：" + thinkingLevels.join(", "));
        }
        await selectThinkingLevel(args as ThinkingLevel);
        return true;
      case "model": {
        const separator = args.indexOf("/");
        if (separator <= 0 || separator === args.length - 1) {
          throw new Error("用法：/model <provider/model>");
        }
        await selectModel(args.slice(0, separator), args.slice(separator + 1));
        return true;
      }
      case "abort":
        await agentGateway.abort();
        return true;
      default:
        return false;
    }
  }

  async function send(): Promise<void> {
    const message = input.trim();
    if (!message || status.state !== "running" || !sessionReady) return;
    setInput("");
    setError(null);
    try {
      if (message.startsWith("/")) {
        const spaceIndex = message.indexOf(" ");
        const command = message.slice(1, spaceIndex === -1 ? undefined : spaceIndex);
        const args = spaceIndex === -1 ? "" : message.slice(spaceIndex + 1).trim();
        if (await executeDesktopCommand(command, args)) return;
      }
      await agentGateway.sendPrompt(message, busy);
    } catch (reason) {
      setInput(message);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function abort(): Promise<void> {
    try {
      await agentGateway.abort();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  function completeCommand(command: ComposerCommand): void {
    setInput("/" + command.name + " ");
    setCommandIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (availableCommands.length > 0 && commandQuery !== null) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setCommandIndex((index) => (index + direction + availableCommands.length) % availableCommands.length);
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        completeCommand(availableCommands[Math.min(commandIndex, availableCommands.length - 1)]);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <footer className="composer-wrap">
      {(error || (status.state === "error" && status.detail)) && (
        <div className="error-banner" role="alert">{error ?? status.detail}</div>
      )}
      <div className="composer-shell">
        {availableCommands.length > 0 && (
          <div className="command-menu" role="listbox" aria-label="Pi 指令">
            <div className="command-menu-title"><WandSparkles size={13} />可用指令</div>
            {availableCommands.map((command, index) => (
              <button
                className={index === commandIndex ? "active" : ""}
                type="button"
                role="option"
                aria-selected={index === commandIndex}
                key={command.source + ":" + command.name}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => completeCommand(command)}
              >
                <span><strong>/{command.name}</strong>{command.usage && <code>{command.usage}</code>}</span>
                <small>{command.description}</small>
                <em>{sourceLabels[command.source]}</em>
              </button>
            ))}
          </div>
        )}
        <div className="composer">
          <textarea
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setCommandIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={!sessionReady ? "正在同步 Pi 会话…" : busy ? "追加后续要求，Pi 会在当前任务后处理…" : chatMode ? "和 Pi 聊点什么，输入 / 查看指令…" : "描述任务、询问代码，或输入 / 调用 Pi 指令…"}
            disabled={!sessionReady}
            rows={3}
            aria-label="发送给 Pi 的任务"
          />
          <div className="composer-toolbar">
            <div className="composer-tools">
              <button className="composer-tool" type="button" disabled title="附件功能尚未接入">
                <Paperclip size={15} />
              </button>
              <span className={"composer-context " + (chatMode ? "chat" : "")}>
                {chatMode ? <MessageCircle size={13} /> : <Terminal size={13} />}
                {chatMode ? "纯聊天 · 无工具" : status.cwd ? "本地工作区" : "等待连接工作区"}
              </span>
              {!chatMode && session && (
                <label className="approval-select" title="控制 Pi 调用工具前是否需要确认">
                  <ShieldCheck size={13} />
                  <select
                    value={session.approvalPolicy}
                    disabled={busy || sessionMutation !== null}
                    onChange={(event) => void setApprovalPolicy(event.target.value as "ask" | "auto")}
                    aria-label="工具批准策略"
                  >
                    <option value="ask">请求批准</option>
                    <option value="auto">自动批准</option>
                  </select>
                  <ChevronDown size={11} />
                </label>
              )}
              {context && (
                <span
                  className="context-usage"
                  title={context.tokens === null ? "上下文窗口 " + formatTokens(context.contextWindow) + "，压缩后等待下次响应重新估算" : "已使用 " + context.tokens.toLocaleString() + " / " + context.contextWindow.toLocaleString() + " tokens"}
                >
                  <CircleGauge size={13} />
                  <span>{context.tokens === null ? "待估算" : formatTokens(context.tokens) + " / " + formatTokens(context.contextWindow)}</span>
                  <i><b style={{ width: String(contextPercent ?? 0) + "%" }} /></i>
                </span>
              )}
            </div>
            <div className="composer-submit">
              <span className="keyboard-hint">Enter <CornerDownLeft size={11} /></span>
              {busy ? (
                <button className="stop-button" type="button" title="中止当前任务" onClick={() => void abort()}>
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button className="send-button" type="button" title="发送任务" disabled={!canSend} onClick={() => void send()}>
                  <Send size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="composer-caption">
        {chatMode ? "聊天模式不会读取或修改本地项目，也不会调用工具。" : session?.approvalPolicy === "ask" ? "每次工具调用都会等待你的批准。" : "Pi 可直接调用当前会话已启用的工具。"}
      </p>
    </footer>
  );
}
