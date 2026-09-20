import {
  ChevronDown,
  CircleGauge,
  CornerDownRight,
  Mic,
  Plus,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import type { ImageAttachment, SessionMode, SlashCommand, ThinkingLevel } from "../../../shared/contracts/agent-session";
import type { WorkspaceFileReference } from "../../../shared/contracts/workspace";
import { agentGateway } from "../../services/agent-gateway";
import { workspaceGateway } from "../../services/workspace-gateway";
import { restoreQueuedMessages } from "../../lib/queued-messages";
import { useAgentStore } from "../../stores/agent-store";
import { useSessionStore } from "../../stores/session-store";
import { useUiStore } from "../../stores/ui-store";
import { ComposerModelControls } from "./ComposerModelControls";

type ComposerCommand = Omit<SlashCommand, "source"> & {
  source: SlashCommand["source"] | "desktop";
  usage?: string;
};

const DESKTOP_COMMANDS: ComposerCommand[] = [
  { name: "new", description: "创建新会话", source: "desktop", usage: "[work|chat]" },
  { name: "chat", description: "新建独立的纯聊天会话", source: "desktop" },
  { name: "work", description: "新建独立的工作会话", source: "desktop" },
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
  const [commandIndex, setCommandIndex] = useState(0);
  const [queueMutation, setQueueMutation] = useState<string | null>(null);
  const [selectingImages, setSelectingImages] = useState(false);
  const [bashRunning, setBashRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [fileReferences, setFileReferences] = useState<WorkspaceFileReference[]>([]);
  const [fileReferenceIndex, setFileReferenceIndex] = useState(0);
  const status = useAgentStore((state) => state.processStatus);
  const busy = useAgentStore((state) => state.busy);
  const error = useAgentStore((state) => state.error);
  const queue = useAgentStore((state) => state.queue);
  const setError = useAgentStore((state) => state.setError);
  const session = useSessionStore((state) => state.session);
  const commands = useSessionStore((state) => state.commands);
  const thinkingLevels = useSessionStore((state) => state.thinkingLevels);
  const sessionMutation = useSessionStore((state) => state.mutation);
  const createSession = useSessionStore((state) => state.createSession);
  const renameSession = useSessionStore((state) => state.renameSession);
  const setApprovalPolicy = useSessionStore((state) => state.setApprovalPolicy);
  const selectModel = useSessionStore((state) => state.selectModel);
  const selectThinkingLevel = useSessionStore((state) => state.selectThinkingLevel);
  const refreshSessionState = useSessionStore((state) => state.refreshSessionState);
  const composerDraft = useUiStore((state) => state.composerDraft);
  const setComposerDraft = useUiStore((state) => state.setComposerDraft);
  const setSessionComposerDraft = useUiStore((state) => state.setSessionComposerDraft);
  const requestChatFollow = useUiStore((state) => state.requestChatFollow);
  const sessionComposerDraft = useUiStore((state) => session ? state.sessionComposerDrafts[session.id] : undefined);
  const input = sessionComposerDraft?.text ?? "";
  const attachments = sessionComposerDraft?.attachments ?? [];
  const sessionChanging = sessionMutation === "initializing" || sessionMutation === "session";
  const sessionReady = session !== null && !sessionChanging;
  const chatMode = session?.mode === "chat";
  const canSend = input.trim().length > 0
    && status.state === "running"
    && sessionReady
    && sessionMutation === null
    && !bashRunning
    && !stopping;
  const commandQuery = input.startsWith("/") && !input.slice(1).includes(" ")
    ? input.slice(1).toLowerCase()
    : null;
  const fileReferenceQuery = useMemo(() => {
    if (chatMode) return null;
    const match = /(?:^|\s)@([^\s@]*)$/.exec(input);
    return match ? { query: match[1] ?? "", start: match.index + match[0].indexOf("@") } : null;
  }, [chatMode, input]);
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
  const queuedCount = queue.steering.length + queue.followUp.length;
  const queuedTasks = useMemo(() => [
    ...queue.steering.map((text, index) => ({ source: "steer" as const, index, text })),
    ...queue.followUp.map((text, index) => ({ source: "followUp" as const, index, text })),
  ], [queue.followUp, queue.steering]);

  useEffect(() => {
    if (composerDraft === null || !session) return;
    setSessionComposerDraft(session.id, { text: composerDraft, attachments });
    setComposerDraft(null);
  }, [attachments, composerDraft, session, setComposerDraft, setSessionComposerDraft]);

  useEffect(() => {
    if (!fileReferenceQuery || !sessionReady) {
      setFileReferences([]);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void workspaceGateway.searchFiles(fileReferenceQuery.query)
        .then((files) => {
          if (!cancelled) {
            setFileReferences(files.slice(0, 8));
            setFileReferenceIndex(0);
          }
        })
        .catch(() => {
          if (!cancelled) setFileReferences([]);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fileReferenceQuery, sessionReady]);

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
        await createSession("chat");
        return true;
      case "work":
        await createSession("work");
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
        await abortCurrentTask();
        return true;
      default:
        return false;
    }
  }

  async function send(): Promise<void> {
    const message = input.trim();
    if (!message || status.state !== "running" || !sessionReady || bashRunning || stopping) return;
    setSessionComposerDraft(session.id, { text: "", attachments });
    setError(null);
    try {
      if (message.startsWith("!")) {
        if (session.mode === "chat") throw new Error("纯聊天会话不能执行终端命令");
        const excludeFromContext = message.startsWith("!!");
        const command = message.slice(excludeFromContext ? 2 : 1).trim();
        if (!command) {
          throw new Error(excludeFromContext ? "用法：!!<命令>" : "用法：!<命令>");
        }
        setBashRunning(true);
        try {
          await agentGateway.runBash(command, excludeFromContext);
        } finally {
          setBashRunning(false);
        }
        return;
      }
      if (message.startsWith("/")) {
        const spaceIndex = message.indexOf(" ");
        const command = message.slice(1, spaceIndex === -1 ? undefined : spaceIndex);
        const args = spaceIndex === -1 ? "" : message.slice(spaceIndex + 1).trim();
        if (await executeDesktopCommand(command, args)) return;
      }
      requestChatFollow();
      await agentGateway.sendPrompt(message, attachments.map((attachment) => attachment.id), busy ? "followUp" : undefined);
      setSessionComposerDraft(session.id, { text: "", attachments: [] });
    } catch (reason) {
      setSessionComposerDraft(session.id, { text: message, attachments });
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function abortCurrentTask(): Promise<void> {
    if (!session || stopping) return;
    const sessionId = session.id;
    setStopping(true);
    const failures: string[] = [];
    try {
      try {
        const queued = await agentGateway.clearQueue();
        if (queued.steering.length > 0 || queued.followUp.length > 0) {
          const draft = useUiStore.getState().sessionComposerDrafts[sessionId];
          setSessionComposerDraft(sessionId, {
            text: restoreQueuedMessages(queued, draft?.text ?? ""),
            attachments: draft?.attachments ?? [],
          });
        }
      } catch (reason) {
        failures.push(`恢复排队消息失败：${reason instanceof Error ? reason.message : String(reason)}`);
      }
      try {
        await agentGateway.abort();
      } catch (reason) {
        failures.push(`停止当前任务失败：${reason instanceof Error ? reason.message : String(reason)}`);
      }
      setError(failures.length > 0 ? failures.join("；") : null);
    } finally {
      setStopping(false);
    }
  }

  async function abortBash(): Promise<void> {
    if (stopping) return;
    setStopping(true);
    try {
      await agentGateway.abortBash();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setStopping(false);
    }
  }

  async function updateQueuedTask(
    source: "steer" | "followUp",
    index: number,
    action: "steer" | "followUp" | "delete",
  ): Promise<void> {
    const mutationKey = `${source}:${index}`;
    if (queueMutation) return;
    setQueueMutation(mutationKey);
    try {
      await agentGateway.updateQueueItem(source, index, action);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setQueueMutation(null);
    }
  }

  async function selectImages(): Promise<void> {
    if (attachments.length >= 4 || !session?.model?.supportsImages) return;
    const selectedForSessionId = session.id;
    setSelectingImages(true);
    try {
      const selected = await agentGateway.selectImages(4 - attachments.length);
      if (useSessionStore.getState().session?.id !== selectedForSessionId) {
        await agentGateway.discardImages(selected.map((attachment) => attachment.id));
        return;
      }
      const currentDraft = useUiStore.getState().sessionComposerDrafts[selectedForSessionId];
      setSessionComposerDraft(selectedForSessionId, {
        text: currentDraft?.text ?? "",
        attachments: [...(currentDraft?.attachments ?? []), ...selected],
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSelectingImages(false);
    }
  }

  async function addImageFiles(files: File[]): Promise<void> {
    if (!session?.model?.supportsImages || attachments.length >= 4) return;
    const images = files.filter((file) => file.type.startsWith("image/")).slice(0, 4 - attachments.length);
    if (images.length === 0) return;
    const selectedForSessionId = session.id;
    setSelectingImages(true);
    try {
      const items = await Promise.all(images.map(async (file, index) => ({
        name: file.name || `pasted-image-${Date.now()}-${index + 1}`,
        mimeType: file.type,
        data: new Uint8Array(await file.arrayBuffer()),
      })));
      const selected = await agentGateway.addImageData(items, 4 - attachments.length);
      if (useSessionStore.getState().session?.id !== selectedForSessionId) {
        await agentGateway.discardImages(selected.map((attachment) => attachment.id));
        return;
      }
      const currentDraft = useUiStore.getState().sessionComposerDrafts[selectedForSessionId];
      setSessionComposerDraft(selectedForSessionId, {
        text: currentDraft?.text ?? "",
        attachments: [...(currentDraft?.attachments ?? []), ...selected],
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSelectingImages(false);
    }
  }

  function removeAttachment(attachment: ImageAttachment): void {
    if (!session) return;
    setSessionComposerDraft(session.id, {
      text: input,
      attachments: attachments.filter((item) => item.id !== attachment.id),
    });
    void agentGateway.discardImages([attachment.id]);
  }

  function completeCommand(command: ComposerCommand): void {
    if (session) setSessionComposerDraft(session.id, { text: "/" + command.name + " ", attachments });
    setCommandIndex(0);
  }

  function completeFileReference(file: WorkspaceFileReference): void {
    if (!session || !fileReferenceQuery) return;
    const reference = file.path.includes(" ") ? `@"${file.path}"` : `@${file.path}`;
    setSessionComposerDraft(session.id, {
      text: `${input.slice(0, fileReferenceQuery.start)}${reference} `,
      attachments,
    });
    setFileReferences([]);
    setFileReferenceIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (fileReferences.length > 0 && fileReferenceQuery) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setFileReferenceIndex((index) => (index + direction + fileReferences.length) % fileReferences.length);
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        completeFileReference(fileReferences[Math.min(fileReferenceIndex, fileReferences.length - 1)]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setFileReferences([]);
        return;
      }
    }
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
        {fileReferences.length > 0 && fileReferenceQuery && (
          <div className="command-menu file-reference-menu" role="listbox" aria-label="工作区文件">
            <div className="command-menu-title"><WandSparkles size={13} />引用工作区文件</div>
            {fileReferences.map((file, index) => (
              <button
                className={index === fileReferenceIndex ? "active" : ""}
                type="button"
                role="option"
                aria-selected={index === fileReferenceIndex}
                key={file.path}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => completeFileReference(file)}
              >
                <span><strong>{file.name}</strong></span>
                <small>{file.path}</small>
                <em>文件</em>
              </button>
            ))}
          </div>
        )}
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
                <span><strong>/{command.name}</strong>{(command.usage || command.argumentHint) && <code>{command.usage || command.argumentHint}</code>}</span>
                <small>{command.description}</small>
                <em>{sourceLabels[command.source]}</em>
              </button>
            ))}
          </div>
        )}
        <div className={`composer ${queuedCount > 0 ? "has-queued-tasks" : ""}`}>
          {queuedCount > 0 && (
            <div className="queued-tasks" aria-label={`已排队 ${queuedCount} 条任务`}>
              {queuedTasks.map((task, order) => {
                const steering = task.source === "steer";
                return (
                  <div className="queued-task-row" key={`${task.source}:${task.index}:${task.text}`}>
                    <span className="queued-task-order" aria-hidden="true"><CornerDownRight size={13} />{order + 1}</span>
                    <span className="queued-task-text" title={task.text}>{task.text}</span>
                    <button
                      className={`queued-task-steer ${steering ? "active" : ""}`}
                      type="button"
                      disabled={queueMutation !== null}
                      title={steering ? "改为当前任务完成后执行" : "在当前回合结束后引导 Agent 转向"}
                      aria-label={steering ? `将排队任务 ${order + 1} 改为后续任务` : `将排队任务 ${order + 1} 改为引导任务`}
                      onClick={() => void updateQueuedTask(task.source, task.index, steering ? "followUp" : "steer")}
                    >
                      <CornerDownRight size={13} />
                      <span>引导</span>
                    </button>
                    <button
                      className="queued-task-delete"
                      type="button"
                      disabled={queueMutation !== null}
                      title="删除排队任务"
                      aria-label={`删除排队任务 ${order + 1}`}
                      onClick={() => void updateQueuedTask(task.source, task.index, "delete")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {attachments.length > 0 && (
            <div className="composer-attachments" aria-label="图片附件">
              {attachments.map((attachment) => (
                <span key={attachment.id}>
                  <img src={attachment.previewDataUrl} alt={attachment.name} />
                  <button type="button" title={`移除 ${attachment.name}`} aria-label={`移除 ${attachment.name}`} onClick={() => removeAttachment(attachment)}><X size={11} /></button>
                </span>
              ))}
            </div>
          )}
          <textarea
            value={input}
            onChange={(event) => {
              if (session) setSessionComposerDraft(session.id, { text: event.target.value, attachments });
              setCommandIndex(0);
            }}
            onKeyDown={handleKeyDown}
            onPaste={(event: ClipboardEvent<HTMLTextAreaElement>) => {
              const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
              if (images.length === 0) return;
              event.preventDefault();
              void addImageFiles(images);
            }}
            onDragOver={(event: DragEvent<HTMLTextAreaElement>) => {
              if (Array.from(event.dataTransfer.items).some((item) => item.kind === "file" && item.type.startsWith("image/"))) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }
            }}
            onDrop={(event: DragEvent<HTMLTextAreaElement>) => {
              const images = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
              if (images.length === 0) return;
              event.preventDefault();
              void addImageFiles(images);
            }}
            placeholder={!sessionReady ? "正在同步 Pi 会话…" : bashRunning ? "Shell 命令正在执行，可点击停止按钮中止…" : busy ? "追加后续要求，Pi 会在当前任务后处理…" : chatMode ? "和 Pi 聊点什么，输入 / 查看指令…" : "描述任务；输入 / 查看指令、@ 引用文件，或用 ! 执行命令…"}
            disabled={!sessionReady}
            rows={3}
            aria-label="发送给 Pi 的任务"
          />
          <div className="composer-toolbar">
            <div className="composer-tools">
              <button className="composer-tool" type="button" disabled={!session?.model?.supportsImages || selectingImages || attachments.length >= 4} title={session?.model?.supportsImages ? "添加图片（暂仅支持图片）" : "当前模型不支持图片输入"} aria-label="添加图片附件" onClick={() => void selectImages()}>
                <Plus size={17} />
              </button>
              {!chatMode && session && (
                <label className={`approval-select ${session.approvalPolicy}`} title="控制 Pi 调用工具前是否需要确认">
                  <span className="approval-select-icon"><ShieldCheck size={13} /></span>
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
              <ComposerModelControls />
              <button className="composer-voice-button" type="button" disabled title="语音输入暂未开放" aria-label="语音输入暂未开放">
                <Mic size={16} />
              </button>
              {busy || bashRunning ? (
                <button className="stop-button" type="button" disabled={stopping} title={bashRunning ? "中止 Shell 命令" : "中止当前任务并恢复排队消息"} onClick={() => void (bashRunning ? abortBash() : abortCurrentTask())}>
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
