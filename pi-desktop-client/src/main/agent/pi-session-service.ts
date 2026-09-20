import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type {
  AgentRuntimeSnapshot,
  AgentHistorySnapshot,
  AgentSessionConfiguration,
  AgentSessionState,
  ApprovalPolicy,
  DesktopModel,
  SessionListItem,
  SessionMode,
  SessionOverview,
  QueueProcessingMode,
  SessionStatistics,
  SessionTreeNavigation,
  SessionTreeNavigationOptions,
  SessionTreeNode,
  SnapshotTurnFileChanges,
  SlashCommand,
  ThinkingLevel,
} from "../../shared/contracts/agent-session";
import { normalizeThinkingLevels } from "../../shared/thinking-levels";
import type { RpcMessage } from "../../shared/rpc";
import { PiProcess } from "../pi-process";
import { getDefaultPiSessionDir, getDesktopChatSessionDir, listAllPiSessions, type PiSessionIndexEntry } from "../sessions/pi-session-index";
import { PiEventAdapter } from "./pi-event-adapter";
import { adaptRpcHistory, toDesktopModel, toThinkingLevel } from "./pi-snapshot-adapter";

type UnknownRecord = Record<string, unknown>;
type DesktopSessionIndexEntry = PiSessionIndexEntry & {
  requiresWorkMode: boolean;
};
type SnapshotCapabilities = Pick<AgentRuntimeSnapshot, "models" | "thinkingLevels" | "commands">;
type HistoryCacheEntry = {
  cursor?: string;
  leafId: string | null;
  history: AgentHistorySnapshot;
};
const RPC_TIMEOUT = 30_000;
const MAX_SESSION_NAME_LENGTH = 120;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseData(response: RpcMessage): UnknownRecord {
  if (!isRecord(response.data)) throw new Error(`Pi RPC ${response.command ?? "响应"} 缺少有效数据`);
  return response.data;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseEntryCursor(value: UnknownRecord, fallback?: string): { cursor?: string; leafId: string | null; changed: boolean } {
  const entries = Array.isArray(value.entries) ? value.entries : [];
  let cursor = fallback;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (!isRecord(entries[index])) continue;
    const id = readString(entries[index].id);
    if (id) {
      cursor = id;
      break;
    }
  }
  return {
    ...(cursor ? { cursor } : {}),
    leafId: readString(value.leafId) ?? null,
    changed: entries.length > 0,
  };
}

function parseSessionMode(value: unknown): SessionMode {
  return value === "chat" ? "chat" : "work";
}

function parseApprovalPolicy(value: unknown): ApprovalPolicy {
  return value === "ask" ? "ask" : "auto";
}

function parseQueueProcessingMode(value: unknown): QueueProcessingMode {
  return value === "one-at-a-time" ? "one-at-a-time" : "all";
}

function parseContextUsage(value: unknown): AgentSessionState["contextUsage"] {
  if (!isRecord(value)) return undefined;
  const contextWindow = readNumber(value.contextWindow);
  const tokens = value.tokens === null ? null : readNumber(value.tokens);
  const percent = value.percent === null ? null : readNumber(value.percent);
  if (contextWindow === undefined || tokens === undefined || percent === undefined) return undefined;
  return { tokens, contextWindow, percent };
}

function validateSessionMode(value: unknown): SessionMode {
  if (value !== "work" && value !== "chat") throw new Error("会话模式无效");
  return value;
}

function validateSessionId(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 200) throw new Error("会话 ID 无效");
  return value;
}

function sameWorkspace(left: string, right: string): boolean {
  if (!left || !right) return false;
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLocaleLowerCase() === normalizedRight.toLocaleLowerCase()
    : normalizedLeft === normalizedRight;
}

function workspaceName(cwd: string): string {
  return basename(cwd) || "未知工作区";
}

function parseSessionState(value: UnknownRecord): AgentSessionState {
  const id = readString(value.sessionId);
  const thinkingLevel = toThinkingLevel(value.thinkingLevel);
  if (!id || !thinkingLevel) throw new Error("Pi 返回了无效的会话状态");
  return {
    id,
    name: readString(value.sessionName),
    mode: parseSessionMode(value.sessionMode),
    approvalPolicy: parseApprovalPolicy(value.approvalPolicy),
    contextUsage: parseContextUsage(value.contextUsage),
    model: toDesktopModel(value.model),
    thinkingLevel,
    isStreaming: value.isStreaming === true,
    isCompacting: value.isCompacting === true,
    isRetrying: value.isRetrying === true,
    steeringMode: parseQueueProcessingMode(value.steeringMode),
    followUpMode: parseQueueProcessingMode(value.followUpMode),
    autoCompactionEnabled: value.autoCompactionEnabled !== false,
    autoRetryEnabled: value.autoRetryEnabled === true,
    messageCount: readNumber(value.messageCount) ?? 0,
    pendingMessageCount: readNumber(value.pendingMessageCount) ?? 0,
  };
}

function parseCommands(value: UnknownRecord): SlashCommand[] {
  if (!Array.isArray(value.commands)) return [];
  const commands: SlashCommand[] = [];
  for (const item of value.commands) {
    if (!isRecord(item)) continue;
    const name = readString(item.name);
    const source = item.source;
    if (!name || (source !== "extension" && source !== "prompt" && source !== "skill")) continue;
    const sourceInfo = isRecord(item.sourceInfo) ? item.sourceInfo : undefined;
    const description = readString(item.description);
    const argumentHint = readString(item.argumentHint);
    const sourceLabel = sourceInfo ? readString(sourceInfo.source) : undefined;
    commands.push({
      name,
      ...(description ? { description } : {}),
      ...(argumentHint ? { argumentHint } : {}),
      source,
      ...(sourceLabel ? { sourceLabel } : {}),
    });
  }
  return commands.sort((left, right) => left.name.localeCompare(right.name));
}

function parseModels(value: UnknownRecord): DesktopModel[] {
  if (!Array.isArray(value.models)) return [];
  return value.models
    .map(toDesktopModel)
    .filter((model): model is DesktopModel => Boolean(model))
    .sort((left, right) => left.provider.localeCompare(right.provider) || left.name.localeCompare(right.name));
}

function parseThinkingLevels(value: UnknownRecord): ThinkingLevel[] {
  if (!Array.isArray(value.levels)) return ["off"];
  const levels = value.levels.map(toThinkingLevel).filter((level): level is ThinkingLevel => Boolean(level));
  return levels.length > 0 ? levels : ["off"];
}

function truncatePreview(value: string, limit = 120): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "无文本内容";
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

function readContentPreview(value: unknown): string | undefined {
  if (typeof value === "string") return truncatePreview(value);
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (typeof item.text === "string") return truncatePreview(item.text);
    if (typeof item.thinking === "string") return truncatePreview(item.thinking);
  }
  return undefined;
}

function parseSessionStatistics(value: UnknownRecord): SessionStatistics {
  const tokens = isRecord(value.tokens) ? value.tokens : {};
  return {
    userMessages: readNumber(value.userMessages) ?? 0,
    assistantMessages: readNumber(value.assistantMessages) ?? 0,
    toolCalls: readNumber(value.toolCalls) ?? 0,
    toolResults: readNumber(value.toolResults) ?? 0,
    totalMessages: readNumber(value.totalMessages) ?? 0,
    tokens: {
      input: readNumber(tokens.input) ?? 0,
      output: readNumber(tokens.output) ?? 0,
      cacheRead: readNumber(tokens.cacheRead) ?? 0,
      cacheWrite: readNumber(tokens.cacheWrite) ?? 0,
      total: readNumber(tokens.total) ?? 0,
    },
    cost: readNumber(value.cost) ?? 0,
  };
}

function sessionTreePreview(entry: UnknownRecord): string {
  const type = readString(entry.type) ?? "entry";
  if (type === "message" && isRecord(entry.message)) {
    const role = readString(entry.message.role);
    const content = readContentPreview(entry.message.content);
    return `${role === "user" ? "用户" : role === "assistant" ? "Pi" : "消息"} · ${content ?? "无文本内容"}`;
  }
  if (type === "custom_message") return `自定义消息 · ${readContentPreview(entry.content) ?? "无文本内容"}`;
  if (type === "tool_result") return `工具结果 · ${readString(entry.toolName) ?? "tool"}`;
  if (type === "compaction") return "上下文压缩";
  if (type === "branch_summary") return `分支摘要 · ${truncatePreview(readString(entry.summary) ?? "")}`;
  if (type === "session_info") return `会话信息 · ${readString(entry.name) ?? ""}`.trim();
  return type.replace(/_/g, " ");
}

function parseSessionTreeNode(value: unknown): SessionTreeNode | undefined {
  if (!isRecord(value) || !isRecord(value.entry)) return undefined;
  const id = readString(value.entry.id);
  const type = readString(value.entry.type);
  if (!id || !type) return undefined;
  const children = Array.isArray(value.children)
    ? value.children.map(parseSessionTreeNode).filter((node): node is SessionTreeNode => Boolean(node))
    : [];
  return {
    id,
    type,
    ...(typeof value.label === "string" && value.label.trim() ? { label: truncatePreview(value.label, 80) } : {}),
    preview: sessionTreePreview(value.entry),
    children,
  };
}

function parseSessionOverview(
  statsValue: UnknownRecord,
  treeValue: UnknownRecord,
  forkValue: UnknownRecord,
): SessionOverview {
  const tree = Array.isArray(treeValue.tree)
    ? treeValue.tree.map(parseSessionTreeNode).filter((node): node is SessionTreeNode => Boolean(node))
    : [];
  const forkTargets = Array.isArray(forkValue.messages)
    ? forkValue.messages.flatMap((item) => {
      if (!isRecord(item)) return [];
      const entryId = readString(item.entryId);
      const text = readString(item.text);
      return entryId && text ? [{ entryId, text: truncatePreview(text, 160) }] : [];
    })
    : [];
  return {
    stats: parseSessionStatistics(statsValue),
    tree,
    leafId: readString(treeValue.leafId) ?? null,
    forkTargets,
  };
}

export class PiSessionService {
  private readonly sessionIndex = new Map<string, DesktopSessionIndexEntry>();
  private recentSessions: SessionListItem[] = [];
  private snapshotCapabilities: SnapshotCapabilities | undefined;
  private readonly historyCache = new Map<string, HistoryCacheEntry>();

  constructor(
    private readonly pi: PiProcess,
    private readonly eventAdapter: PiEventAdapter,
    private readonly trashItem: (path: string) => Promise<void>,
    private readonly chatSessionDirectory: (cwd: string) => string = getDesktopChatSessionDir,
    private readonly loadTurnFileChanges: (sessionId: string) => Promise<SnapshotTurnFileChanges[]> = async () => [],
  ) {}

  async getSnapshot(
    synchronizeSession = false,
    cachedSessions?: SessionListItem[],
    reuseCapabilities = false,
  ): Promise<AgentRuntimeSnapshot> {
    const { session, sessionFile } = await this.getNormalizedCurrentSession();
    if (synchronizeSession) this.eventAdapter.synchronizeSession(session.id);

    const cachedCapabilities = this.snapshotCapabilities;
    const capabilitiesPromise = reuseCapabilities && cachedCapabilities
      ? this.pi.send({ type: "get_available_thinking_levels" }, RPC_TIMEOUT).then((thinkingResponse) => ({
        models: cachedCapabilities.models,
        thinkingLevels: parseThinkingLevels(responseData(thinkingResponse)),
        commands: cachedCapabilities.commands,
      }))
      : Promise.all([
        this.pi.send({ type: "get_available_models" }, RPC_TIMEOUT),
        this.pi.send({ type: "get_available_thinking_levels" }, RPC_TIMEOUT),
        this.pi.send({ type: "get_commands" }, RPC_TIMEOUT),
      ]).then(([modelsResponse, thinkingResponse, commandsResponse]) => ({
        models: parseModels(responseData(modelsResponse)),
        thinkingLevels: parseThinkingLevels(responseData(thinkingResponse)),
        commands: parseCommands(responseData(commandsResponse)),
      }));
    const [history, sessions, capabilities, storedTurnFileChanges] = await Promise.all([
      this.getHistory(session.id),
      cachedSessions ? Promise.resolve(cachedSessions) : this.listSessions(session, sessionFile),
      capabilitiesPromise,
      this.loadTurnFileChanges(session.id),
    ]);
    const normalizedCapabilities = {
      ...capabilities,
      thinkingLevels: normalizeThinkingLevels(capabilities.thinkingLevels, session.thinkingLevel),
    };
    this.snapshotCapabilities = normalizedCapabilities;
    const userTurnCount = history.messages.filter((message) => message.role === "user").length;
    const turnFileChanges = storedTurnFileChanges.filter((entry) => entry.turnIndex < userTurnCount);

    return {
      sequence: this.eventAdapter.getSequence(),
      session,
      sessions,
      ...normalizedCapabilities,
      history: {
        ...history,
        ...(turnFileChanges.length > 0 ? { turnFileChanges } : {}),
      },
    };
  }

  private async getHistory(sessionId: string): Promise<AgentHistorySnapshot> {
    const cached = this.historyCache.get(sessionId);
    let entryState: ReturnType<typeof parseEntryCursor>;
    try {
      const entriesResponse = await this.pi.send({
        type: "get_entries",
        ...(cached?.cursor ? { since: cached.cursor } : {}),
      }, RPC_TIMEOUT);
      entryState = parseEntryCursor(responseData(entriesResponse), cached?.cursor);
    } catch {
      // Older or third-party Pi RPC hosts may not expose get_entries. Keep the
      // full-message path as a compatibility fallback instead of blocking the UI.
      const messagesResponse = await this.pi.send({ type: "get_messages" }, RPC_TIMEOUT);
      const history = adaptRpcHistory(sessionId, responseData(messagesResponse).messages);
      this.historyCache.delete(sessionId);
      return history;
    }
    if (cached && !entryState.changed && entryState.leafId === cached.leafId) return cached.history;

    const messagesResponse = await this.pi.send({ type: "get_messages" }, RPC_TIMEOUT);
    const history = adaptRpcHistory(sessionId, responseData(messagesResponse).messages);
    this.historyCache.set(sessionId, {
      ...(entryState.cursor ? { cursor: entryState.cursor } : {}),
      leafId: entryState.leafId,
      history,
    });
    return history;
  }

  async getSessionState(): Promise<AgentSessionState> {
    return (await this.getNormalizedCurrentSession()).session;
  }

  async getSessionConfiguration(): Promise<AgentSessionConfiguration> {
    const { session } = await this.getNormalizedCurrentSession();
    const response = await this.pi.send({ type: "get_available_thinking_levels" }, RPC_TIMEOUT);
    return {
      session,
      thinkingLevels: normalizeThinkingLevels(parseThinkingLevels(responseData(response)), session.thinkingLevel),
    };
  }

  async getSessionOverview(): Promise<SessionOverview> {
    const [statsResponse, treeResponse, forkResponse] = await Promise.all([
      this.pi.send({ type: "get_session_stats" }, RPC_TIMEOUT),
      this.pi.send({ type: "get_tree" }, RPC_TIMEOUT),
      this.pi.send({ type: "get_fork_messages" }, RPC_TIMEOUT),
    ]);
    return parseSessionOverview(
      responseData(statsResponse),
      responseData(treeResponse),
      responseData(forkResponse),
    );
  }

  async cloneCurrentSession(): Promise<AgentRuntimeSnapshot> {
    this.eventAdapter.beginSession();
    const response = await this.pi.send({ type: "clone" }, RPC_TIMEOUT);
    if (isRecord(response.data) && response.data.cancelled === true) return this.getSnapshot(false);
    return this.getSnapshot(true);
  }

  async forkCurrentSession(entryId: unknown): Promise<AgentRuntimeSnapshot> {
    const targetId = validateSessionId(entryId);
    this.eventAdapter.beginSession();
    const response = await this.pi.send({ type: "fork", entryId: targetId }, RPC_TIMEOUT);
    if (isRecord(response.data) && response.data.cancelled === true) return this.getSnapshot(false);
    return this.getSnapshot(true);
  }

  async navigateCurrentSessionTree(entryId: unknown, options: SessionTreeNavigationOptions): Promise<SessionTreeNavigation> {
    const targetId = validateSessionId(entryId);
    if (!isRecord(options) || typeof options.summarize !== "boolean") throw new Error("会话树跳转选项无效");
    const customInstructions = readString(options.customInstructions)?.trim();
    const label = readString(options.label)?.trim();
    const response = await this.pi.send({
      type: "navigate_tree",
      targetId,
      summarize: options.summarize,
      ...(customInstructions ? { customInstructions, replaceInstructions: options.replaceInstructions === true } : {}),
      ...(label ? { label } : {}),
    }, RPC_TIMEOUT);
    const data = responseData(response);
    if (data.cancelled === true) return { snapshot: await this.getSnapshot(false) };
    const snapshot = await this.getSnapshot(true);
    const editorText = readString(data.editorText);
    return { snapshot, ...(editorText === undefined ? {} : { editorText }) };
  }

  async exportCurrentSession(outputPath: string, format: "html" | "jsonl"): Promise<string> {
    if (!outputPath.trim()) throw new Error("导出路径无效");
    const response = await this.pi.send({ type: format === "html" ? "export_html" : "export_jsonl", outputPath }, RPC_TIMEOUT);
    const path = readString(responseData(response).path);
    if (!path) throw new Error("Pi 未返回导出文件路径");
    return path;
  }

  async importSession(inputPath: string): Promise<AgentRuntimeSnapshot> {
    if (!inputPath.trim()) throw new Error("导入文件路径无效");
    this.eventAdapter.beginSession();
    const response = await this.pi.send({ type: "import_session", inputPath }, RPC_TIMEOUT);
    if (isRecord(response.data) && response.data.cancelled === true) return this.getSnapshot(false);
    const { session, sessionFile } = await this.getNormalizedCurrentSession();
    const currentWorkspace = this.pi.getStatus().cwd;
    const imported = (await listAllPiSessions(currentWorkspace, {
      activeSessionFile: sessionFile,
      additionalSessionDirs: [this.chatSessionDirectory(currentWorkspace)],
    })).find((candidate) => candidate.id === session.id);
    if (
      imported
      && !this.isDesktopChatSession(sessionFile, currentWorkspace)
      && imported.cwd
      && existsSync(imported.cwd)
    ) {
      this.pi.setWorkspaceCwd(imported.cwd);
    }
    return this.getSnapshot(true);
  }

  async newSession(mode: unknown = "work"): Promise<AgentRuntimeSnapshot> {
    const sessionMode = validateSessionMode(mode);
    const { sessionFile } = await this.getNormalizedCurrentSession();
    const cwd = this.pi.getStatus().cwd;
    const chatSessionDir = this.chatSessionDirectory(cwd);

    const currentIsChat = this.isDesktopChatSession(sessionFile, cwd);
    const sessionDir = sessionMode === "chat"
      ? chatSessionDir
      : currentIsChat
        ? getDefaultPiSessionDir(cwd)
        : undefined;

    this.eventAdapter.beginSession();
    const response = await this.pi.send({ type: "new_session", ...(sessionDir ? { sessionDir } : {}) }, RPC_TIMEOUT);
    if (isRecord(response.data) && response.data.cancelled === true) return this.getSnapshot(false);
    if (sessionMode === "chat") await this.pi.send({ type: "set_session_mode", mode: sessionMode }, RPC_TIMEOUT);
    return this.getSnapshot(true);
  }

  async switchSession(sessionId: unknown): Promise<AgentRuntimeSnapshot> {
    const id = validateSessionId(sessionId);
    let target = this.sessionIndex.get(id);
    if (!target) {
      const { session: currentState, sessionFile } = await this.getNormalizedCurrentSession();
      await this.listSessions(currentState, sessionFile);
      target = this.sessionIndex.get(id);
    }
    if (!target) throw new Error("找不到目标会话");

    const currentWorkspace = this.pi.getStatus().cwd;
    if (target.mode === "work" && !target.cwd) {
      throw new Error("工作会话缺少原工作区目录，无法恢复");
    }
    if (target.mode === "work" && !existsSync(target.cwd)) {
      throw new Error("原工作区目录不存在，无法恢复此工作会话");
    }

    const response = await this.pi.send({
      type: "switch_session",
      sessionPath: target.path,
      ...(target.mode === "chat" ? { cwdOverride: currentWorkspace } : {}),
    }, RPC_TIMEOUT);
    if (isRecord(response.data) && response.data.cancelled === true) return this.getSnapshot(false);
    if (target.mode === "work") this.pi.setWorkspaceCwd(target.cwd);
    if (target.requiresWorkMode) await this.pi.send({ type: "set_session_mode", mode: "work" }, RPC_TIMEOUT);
    return this.getSnapshot(true, this.cachedSessionsWithCurrent(id), true);
  }

  async renameSession(sessionId: unknown, name: unknown): Promise<AgentRuntimeSnapshot> {
    const id = validateSessionId(sessionId);
    if (typeof name !== "string") throw new Error("会话名称无效");
    const normalizedName = name.replace(/[\r\n]+/g, " ").trim();
    if (!normalizedName || normalizedName.length > MAX_SESSION_NAME_LENGTH) {
      throw new Error(`会话名称必须为 1-${MAX_SESSION_NAME_LENGTH} 个字符`);
    }
    const { session: current, sessionFile } = await this.getNormalizedCurrentSession();
    await this.listSessions(current, sessionFile);
    const target = this.sessionIndex.get(id);
    if (!target) throw new Error("找不到目标会话");
    await this.pi.send({ type: "rename_session", sessionId: id, name: normalizedName, sessionPath: target.path }, RPC_TIMEOUT);
    return this.getSnapshot(false);
  }

  async deleteSession(sessionId: unknown): Promise<AgentRuntimeSnapshot> {
    const id = validateSessionId(sessionId);
    const { session: current, sessionFile } = await this.getNormalizedCurrentSession();
    await this.listSessions(current, sessionFile);
    const target = this.sessionIndex.get(id);
    if (!target) throw new Error("找不到目标会话");

    if (id === current.id) {
      if (target.requiresWorkMode) await this.pi.send({ type: "set_session_mode", mode: "work" }, RPC_TIMEOUT);
      const response = await this.pi.send({ type: "new_session" }, RPC_TIMEOUT);
      if (isRecord(response.data) && response.data.cancelled === true) throw new Error("创建替代会话已取消，未删除当前会话");
      if (target.mode === "chat") await this.pi.send({ type: "set_session_mode", mode: "chat" }, RPC_TIMEOUT);
    }
    await this.trashItem(target.path);
    this.historyCache.delete(id);
    return this.getSnapshot(id === current.id);
  }

  async setSessionMode(mode: unknown): Promise<AgentRuntimeSnapshot> {
    const sessionMode = validateSessionMode(mode);
    const { session, sessionFile } = await this.getNormalizedCurrentSession();
    const currentMode = this.isDesktopChatSession(sessionFile, this.pi.getStatus().cwd) ? "chat" : "work";
    if (currentMode === sessionMode && session.mode === sessionMode) return this.getSnapshot(false);
    return this.newSession(sessionMode);
  }

  async setApprovalPolicy(policy: unknown): Promise<AgentRuntimeSnapshot> {
    if (policy !== "ask" && policy !== "auto") throw new Error("工具批准策略无效");
    await this.pi.send({ type: "set_approval_policy", policy }, RPC_TIMEOUT);
    return this.getSnapshot(false);
  }

  async setSteeringMode(mode: unknown): Promise<AgentRuntimeSnapshot> {
    if (mode !== "all" && mode !== "one-at-a-time") throw new Error("转向队列策略无效");
    await this.pi.send({ type: "set_steering_mode", mode }, RPC_TIMEOUT);
    return this.getSnapshot(false);
  }

  async setFollowUpMode(mode: unknown): Promise<AgentRuntimeSnapshot> {
    if (mode !== "all" && mode !== "one-at-a-time") throw new Error("后续任务队列策略无效");
    await this.pi.send({ type: "set_follow_up_mode", mode }, RPC_TIMEOUT);
    return this.getSnapshot(false);
  }

  async setAutoCompaction(enabled: unknown): Promise<AgentRuntimeSnapshot> {
    if (typeof enabled !== "boolean") throw new Error("自动压缩设置无效");
    await this.pi.send({ type: "set_auto_compaction", enabled }, RPC_TIMEOUT);
    return this.getSnapshot(false);
  }

  async setAutoRetry(enabled: unknown): Promise<AgentRuntimeSnapshot> {
    if (typeof enabled !== "boolean") throw new Error("自动重试设置无效");
    await this.pi.send({ type: "set_auto_retry", enabled }, RPC_TIMEOUT);
    return this.getSnapshot(false);
  }

  async setModel(provider: unknown, modelId: unknown): Promise<AgentRuntimeSnapshot> {
    if (typeof provider !== "string" || typeof modelId !== "string") throw new Error("模型参数无效");
    const modelsResponse = await this.pi.send({ type: "get_available_models" }, RPC_TIMEOUT);
    const model = parseModels(responseData(modelsResponse)).find((item) => item.provider === provider && item.id === modelId);
    if (!model) throw new Error("所选模型不在 Pi 当前可用模型列表中");
    await this.pi.send({ type: "set_model", provider, modelId }, RPC_TIMEOUT);
    return this.getSnapshot(false);
  }

  async setThinkingLevel(level: unknown): Promise<AgentRuntimeSnapshot> {
    const parsedLevel = toThinkingLevel(level);
    if (!parsedLevel) throw new Error("Thinking Level 无效");
    const levelsResponse = await this.pi.send({ type: "get_available_thinking_levels" }, RPC_TIMEOUT);
    const levels = parseThinkingLevels(responseData(levelsResponse));
    if (!levels.includes(parsedLevel)) throw new Error("当前模型不支持所选 Thinking Level");
    await this.pi.send({ type: "set_thinking_level", level: parsedLevel }, RPC_TIMEOUT);
    return this.getSnapshot(false);
  }

  private async getNormalizedCurrentSession(): Promise<{ session: AgentSessionState; sessionFile?: string }> {
    let stateData = responseData(await this.pi.send({ type: "get_state" }, RPC_TIMEOUT));
    let session = parseSessionState(stateData);
    let sessionFile = readString(stateData.sessionFile);
    const cwd = this.pi.getStatus().cwd;
    if (session.mode === "chat" && !session.isStreaming && !this.isDesktopChatSession(sessionFile, cwd)) {
      await this.pi.send({ type: "set_session_mode", mode: "work" }, RPC_TIMEOUT);
      stateData = responseData(await this.pi.send({ type: "get_state" }, RPC_TIMEOUT));
      session = parseSessionState(stateData);
      sessionFile = readString(stateData.sessionFile);
    }
    return { session, sessionFile };
  }

  private isDesktopChatSession(sessionFile: string | undefined, cwd: string): boolean {
    return Boolean(sessionFile) && sameWorkspace(dirname(sessionFile!), this.chatSessionDirectory(cwd));
  }

  private cachedSessionsWithCurrent(sessionId: string): SessionListItem[] | undefined {
    if (!this.recentSessions.some((session) => session.id === sessionId)) return undefined;
    this.recentSessions = this.recentSessions
      .filter((session) => session.id === sessionId || session.messageCount > 0)
      .map((session) => ({ ...session, current: session.id === sessionId }));
    return this.recentSessions;
  }

  private async listSessions(current: AgentSessionState, activeSessionFile?: string): Promise<SessionListItem[]> {
    const cwd = this.pi.getStatus().cwd;
    const sessionInfos = await listAllPiSessions(cwd, {
      activeSessionFile,
      additionalSessionDirs: [this.chatSessionDirectory(cwd)],
    });
    this.sessionIndex.clear();
    const sessions = sessionInfos
      .filter((source) => source.id === current.id || source.messageCount > 0)
      .map((source): SessionListItem => {
        const isGlobalChat = this.isDesktopChatSession(source.path, cwd);
        const session: DesktopSessionIndexEntry = {
          ...source,
          mode: isGlobalChat ? "chat" : "work",
          requiresWorkMode: !isGlobalChat && source.mode === "chat",
        };
        this.sessionIndex.set(session.id, session);
        const scope = session.mode === "chat" ? "global" : "workspace";
        return {
          id: session.id,
          name: session.name,
          mode: session.mode,
          scope,
          firstMessage: session.firstMessage,
          createdAt: session.createdAt,
          modifiedAt: session.modifiedAt,
          messageCount: session.messageCount,
          current: session.id === current.id,
          ...(scope === "workspace"
            ? {
                workspace: {
                  name: workspaceName(session.cwd),
                  current: sameWorkspace(session.cwd, cwd),
                  available: Boolean(session.cwd) && existsSync(session.cwd),
                },
              }
            : {}),
        };
      });

    if (!sessions.some((session) => session.id === current.id)) {
      const isGlobalChat = this.isDesktopChatSession(activeSessionFile, cwd);
      sessions.unshift({
        id: current.id,
        name: current.name,
        mode: isGlobalChat ? "chat" : "work",
        scope: isGlobalChat ? "global" : "workspace",
        firstMessage: "新会话",
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        messageCount: current.messageCount,
        current: true,
        ...(!isGlobalChat
          ? { workspace: { name: workspaceName(cwd), current: true, available: existsSync(cwd) } }
          : {}),
      });
    }
    this.recentSessions = sessions;
    return sessions;
  }
}
