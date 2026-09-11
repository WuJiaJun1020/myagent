import type {
  AgentRuntimeSnapshot,
  AgentSessionState,
  ApprovalPolicy,
  DesktopModel,
  SessionListItem,
  SessionMode,
  SlashCommand,
  ThinkingLevel,
} from "../../shared/contracts/agent-session";
import type { RpcMessage } from "../../shared/rpc";
import { PiProcess } from "../pi-process";
import { listPiSessions } from "../sessions/pi-session-index";
import { PiEventAdapter } from "./pi-event-adapter";
import { adaptRpcHistory, toDesktopModel, toThinkingLevel } from "./pi-snapshot-adapter";

type UnknownRecord = Record<string, unknown>;
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

function parseSessionMode(value: unknown): SessionMode {
  return value === "chat" ? "chat" : "work";
}

function parseApprovalPolicy(value: unknown): ApprovalPolicy {
  return value === "ask" ? "ask" : "auto";
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
    commands.push({ name, description: readString(item.description), source });
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

export class PiSessionService {
  private readonly sessionPaths = new Map<string, string>();

  constructor(
    private readonly pi: PiProcess,
    private readonly eventAdapter: PiEventAdapter,
    private readonly trashItem: (path: string) => Promise<void>,
  ) {}

  async getSnapshot(synchronizeSession = false): Promise<AgentRuntimeSnapshot> {
    const stateResponse = await this.pi.send({ type: "get_state" }, RPC_TIMEOUT);
    const stateData = responseData(stateResponse);
    const session = parseSessionState(stateData);
    const sessionFile = readString(stateData.sessionFile);
    if (synchronizeSession) this.eventAdapter.synchronizeSession(session.id);

    const [messagesResponse, modelsResponse, thinkingResponse, commandsResponse, sessions] = await Promise.all([
      this.pi.send({ type: "get_messages" }, RPC_TIMEOUT),
      this.pi.send({ type: "get_available_models" }, RPC_TIMEOUT),
      this.pi.send({ type: "get_available_thinking_levels" }, RPC_TIMEOUT),
      this.pi.send({ type: "get_commands" }, RPC_TIMEOUT),
      this.listSessions(session, sessionFile),
    ]);
    const messageData = responseData(messagesResponse);

    return {
      sequence: this.eventAdapter.getSequence(),
      session,
      sessions,
      models: parseModels(responseData(modelsResponse)),
      thinkingLevels: parseThinkingLevels(responseData(thinkingResponse)),
      commands: parseCommands(responseData(commandsResponse)),
      history: adaptRpcHistory(session.id, messageData.messages),
    };
  }

  async getSessionState(): Promise<AgentSessionState> {
    return parseSessionState(responseData(await this.pi.send({ type: "get_state" }, RPC_TIMEOUT)));
  }

  async newSession(mode: unknown = "work"): Promise<AgentRuntimeSnapshot> {
    const sessionMode = validateSessionMode(mode);
    const response = await this.pi.send({ type: "new_session" }, RPC_TIMEOUT);
    if (isRecord(response.data) && response.data.cancelled === true) return this.getSnapshot(false);
    if (sessionMode === "chat") await this.pi.send({ type: "set_session_mode", mode: sessionMode }, RPC_TIMEOUT);
    return this.getSnapshot(true);
  }

  async switchSession(sessionId: unknown): Promise<AgentRuntimeSnapshot> {
    const id = validateSessionId(sessionId);
    const stateData = responseData(await this.pi.send({ type: "get_state" }, RPC_TIMEOUT));
    const currentState = parseSessionState(stateData);
    await this.listSessions(currentState, readString(stateData.sessionFile));
    const sessionPath = this.sessionPaths.get(id);
    if (!sessionPath) throw new Error("找不到当前工作区中的目标会话");
    const response = await this.pi.send({ type: "switch_session", sessionPath }, RPC_TIMEOUT);
    if (isRecord(response.data) && response.data.cancelled === true) return this.getSnapshot(false);
    return this.getSnapshot(true);
  }

  async renameSession(sessionId: unknown, name: unknown): Promise<AgentRuntimeSnapshot> {
    const id = validateSessionId(sessionId);
    if (typeof name !== "string") throw new Error("会话名称无效");
    const normalizedName = name.replace(/[\r\n]+/g, " ").trim();
    if (!normalizedName || normalizedName.length > MAX_SESSION_NAME_LENGTH) {
      throw new Error(`会话名称必须为 1-${MAX_SESSION_NAME_LENGTH} 个字符`);
    }
    const stateData = responseData(await this.pi.send({ type: "get_state" }, RPC_TIMEOUT));
    const current = parseSessionState(stateData);
    await this.listSessions(current, readString(stateData.sessionFile));
    if (!this.sessionPaths.has(id)) throw new Error("找不到当前工作区中的目标会话");
    await this.pi.send({ type: "rename_session", sessionId: id, name: normalizedName }, RPC_TIMEOUT);
    return this.getSnapshot(false);
  }

  async deleteSession(sessionId: unknown): Promise<AgentRuntimeSnapshot> {
    const id = validateSessionId(sessionId);
    const stateData = responseData(await this.pi.send({ type: "get_state" }, RPC_TIMEOUT));
    const current = parseSessionState(stateData);
    await this.listSessions(current, readString(stateData.sessionFile));
    const sessionPath = this.sessionPaths.get(id);
    if (!sessionPath) throw new Error("找不到当前工作区中的目标会话");

    if (id === current.id) {
      const response = await this.pi.send({ type: "new_session" }, RPC_TIMEOUT);
      if (isRecord(response.data) && response.data.cancelled === true) throw new Error("创建替代会话已取消，未删除当前会话");
      if (current.mode === "chat") await this.pi.send({ type: "set_session_mode", mode: "chat" }, RPC_TIMEOUT);
    }
    await this.trashItem(sessionPath);
    return this.getSnapshot(id === current.id);
  }

  async setSessionMode(mode: unknown): Promise<AgentRuntimeSnapshot> {
    const sessionMode = validateSessionMode(mode);
    await this.pi.send({ type: "set_session_mode", mode: sessionMode }, RPC_TIMEOUT);
    return this.getSnapshot(false);
  }

  async setApprovalPolicy(policy: unknown): Promise<AgentRuntimeSnapshot> {
    if (policy !== "ask" && policy !== "auto") throw new Error("工具批准策略无效");
    await this.pi.send({ type: "set_approval_policy", policy }, RPC_TIMEOUT);
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

  private async listSessions(current: AgentSessionState, activeSessionFile?: string): Promise<SessionListItem[]> {
    const cwd = this.pi.getStatus().cwd;
    const sessionInfos = await listPiSessions(cwd, { activeSessionFile });
    this.sessionPaths.clear();
    const sessions = sessionInfos.map((session): SessionListItem => {
      this.sessionPaths.set(session.id, session.path);
      return {
        id: session.id,
        name: session.name,
        mode: session.mode,
        firstMessage: session.firstMessage,
        createdAt: session.createdAt,
        modifiedAt: session.modifiedAt,
        messageCount: session.messageCount,
        current: session.id === current.id,
      };
    });

    if (!sessions.some((session) => session.id === current.id)) {
      sessions.unshift({
        id: current.id,
        name: current.name,
        mode: current.mode,
        firstMessage: "新会话",
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        messageCount: current.messageCount,
        current: true,
      });
    }
    return sessions;
  }
}
