import { appendFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionMode, ThinkingLevel } from "../../shared/contracts/agent-session";
import type { RpcCommand, RpcMessage } from "../../shared/rpc";
import { PiEventAdapter } from "./pi-event-adapter";
import { PiSessionService } from "./pi-session-service";
import type { PiProcess } from "../pi-process";

const temporaryDirectories: string[] = [];

function latestSwitchCommand(commands: RpcCommand[]): (RpcCommand & { type: "switch_session"; sessionPath: string; cwdOverride?: string }) | undefined {
  return [...commands].reverse().find((command): command is RpcCommand & { type: "switch_session"; sessionPath: string; cwdOverride?: string } =>
    command.type === "switch_session" && typeof command.sessionPath === "string");
}

class FakePi {
  currentId = "current";
  currentMode: SessionMode = "chat";
  currentApprovalPolicy: "ask" | "auto" = "auto";
  readonly thinkingLevelBySession = new Map<string, ThinkingLevel>();
  readonly thinkingLevelsBySession = new Map<string, ThinkingLevel[]>();
  readonly commands: RpcCommand[] = [];
  readonly restarts: Array<{ cwd: string; sessionDir?: string }> = [];
  private sessionDirectory: string;

  constructor(
    private cwd: string,
    sessionDirectory: string,
  ) {
    this.sessionDirectory = sessionDirectory;
  }

  getStatus() {
    return { state: "running" as const, cwd: this.cwd };
  }

  setWorkspaceCwd(cwd: string) {
    this.cwd = cwd;
  }

  async restart(cwd: string, sessionDir?: string) {
    this.cwd = cwd;
    this.sessionDirectory = sessionDir ?? this.defaultSessionDirectory;
    this.restarts.push({ cwd, sessionDir });
  }

  private get defaultSessionDirectory(): string {
    return this.sessionDirectory.includes("chat-sessions") ? this.sessionDirectory.replace("chat-sessions", "sessions") : this.sessionDirectory;
  }

  async send(command: RpcCommand): Promise<RpcMessage> {
    this.commands.push(command);
    const sessionFile = join(this.sessionDirectory, `${this.currentId}.jsonl`);
    if (command.type === "get_state") {
      return { type: "response", command: command.type, success: true, data: {
        sessionId: this.currentId,
        sessionFile,
        sessionMode: this.currentMode,
        approvalPolicy: this.currentApprovalPolicy,
        contextUsage: { tokens: 1234, contextWindow: 32_000, percent: 3.85625 },
        thinkingLevel: this.thinkingLevelBySession.get(this.currentId) ?? "off",
        isStreaming: false,
        isCompacting: false,
        messageCount: 0,
        pendingMessageCount: 0,
      } };
    }
    if (command.type === "get_messages") return { type: "response", command: command.type, success: true, data: { messages: [] } };
    if (command.type === "get_available_models") return { type: "response", command: command.type, success: true, data: { models: [] } };
    if (command.type === "get_available_thinking_levels") return {
      type: "response",
      command: command.type,
      success: true,
      data: { levels: this.thinkingLevelsBySession.get(this.currentId) ?? ["off"] },
    };
    if (command.type === "get_commands") return { type: "response", command: command.type, success: true, data: { commands: [
      { name: "review", description: "Review changes", source: "prompt", sourceInfo: { origin: "user" } },
    ] } };
    if (command.type === "rename_session") {
      const target = join(this.sessionDirectory, `${String(command.sessionId)}.jsonl`);
      await appendFile(target, `${JSON.stringify({ type: "session_info", id: "rename", parentId: null, timestamp: new Date().toISOString(), name: command.name })}\n`, "utf8");
      return { type: "response", command: command.type, success: true };
    }
    if (command.type === "new_session") {
      this.currentId = "replacement";
      this.currentMode = "work";
      if (typeof command.sessionDir === "string") this.sessionDirectory = command.sessionDir;
      await writeFile(join(this.sessionDirectory, "replacement.jsonl"), `${JSON.stringify({ type: "session", id: this.currentId, cwd: this.cwd, timestamp: new Date().toISOString() })}\n`, "utf8");
      return { type: "response", command: command.type, success: true, data: { cancelled: false } };
    }
    if (command.type === "set_session_mode") {
      this.currentMode = command.mode as SessionMode;
      const target = join(this.sessionDirectory, `${this.currentId}.jsonl`);
      await appendFile(target, `${JSON.stringify({ type: "custom", id: "mode", parentId: null, timestamp: new Date().toISOString(), customType: "pi.rpc.session-mode", data: { mode: this.currentMode, workToolNames: ["read"] } })}\n`, "utf8");
      return { type: "response", command: command.type, success: true, data: { mode: this.currentMode } };
    }
    if (command.type === "set_approval_policy") {
      this.currentApprovalPolicy = command.policy as "ask" | "auto";
      return { type: "response", command: command.type, success: true, data: { policy: this.currentApprovalPolicy } };
    }
    if (command.type === "navigate_tree") {
      return { type: "response", command: command.type, success: true, data: { cancelled: false, editorText: "restored draft" } };
    }
    if (command.type === "switch_session") {
      const sessionPath = typeof command.sessionPath === "string" ? command.sessionPath : "";
      this.currentId = basename(sessionPath, ".jsonl");
      this.sessionDirectory = dirname(sessionPath);
      this.currentMode = this.currentId === "global-chat" ? "chat" : "work";
      return { type: "response", command: command.type, success: true, data: { cancelled: false } };
    }
    throw new Error(`Unexpected command: ${command.type}`);
  }
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "pi-desktop-session-service-"));
  temporaryDirectories.push(root);
  const cwd = join(root, "workspace");
  const otherWorkspace = join(root, "other-workspace");
  const sessions = join(root, "sessions");
  const chatSessions = join(root, "chat-sessions");
  await mkdir(cwd);
  await mkdir(otherWorkspace);
  await mkdir(sessions);
  await mkdir(chatSessions);
  for (const id of ["current", "older"]) {
    await writeFile(join(sessions, `${id}.jsonl`), [
      JSON.stringify({ type: "session", id, cwd, timestamp: new Date().toISOString() }),
      JSON.stringify({ type: "message", id: `${id}-message`, parentId: null, timestamp: new Date().toISOString(), message: { role: "user", content: "hello", timestamp: Date.now() } }),
      "",
    ].join("\n"), "utf8");
  }
  await writeFile(join(sessions, "other-work.jsonl"), [
    JSON.stringify({ type: "session", id: "other-work", cwd: otherWorkspace, timestamp: new Date().toISOString() }),
    JSON.stringify({ type: "message", id: "other-work-message", parentId: null, timestamp: new Date().toISOString(), message: { role: "user", content: "work", timestamp: Date.now() } }),
    "",
  ].join("\n"), "utf8");
  await writeFile(join(chatSessions, "global-chat.jsonl"), [
    JSON.stringify({ type: "session", id: "global-chat", cwd: otherWorkspace, timestamp: new Date().toISOString() }),
    JSON.stringify({ type: "custom", id: "mode", parentId: null, timestamp: new Date().toISOString(), customType: "pi.rpc.session-mode", data: { mode: "chat", workToolNames: [] } }),
    JSON.stringify({ type: "message", id: "global-chat-message", parentId: "mode", timestamp: new Date().toISOString(), message: { role: "user", content: "chat", timestamp: Date.now() } }),
    "",
  ].join("\n"), "utf8");
  const fakePi = new FakePi(cwd, sessions);
  const trashed: string[] = [];
  const service = new PiSessionService(fakePi as unknown as PiProcess, new PiEventAdapter(), async (path) => {
    trashed.push(path);
    await rm(path);
  }, () => chatSessions);
  return { service, trashed, sessions, chatSessions, fakePi, cwd, otherWorkspace };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("PiSessionService mutations", () => {
  it("exposes Pi commands, context usage, and persists the selected approval policy", async () => {
    const { service } = await setup();
    const initial = await service.getSnapshot();
    expect(initial.commands).toEqual([{ name: "review", description: "Review changes", source: "prompt" }]);
    expect(initial.session.contextUsage).toEqual({ tokens: 1234, contextWindow: 32_000, percent: 3.85625 });

    const updated = await service.setApprovalPolicy("ask");
    expect(updated.session.approvalPolicy).toBe("ask");
  });

  it("renames an inactive session through Pi and refreshes the index", async () => {
    const { service } = await setup();
    const snapshot = await service.renameSession("older", "讨论记录");
    expect(snapshot.sessions.find((session) => session.id === "older")?.name).toBe("讨论记录");
  });

  it("migrates existing chat-mode session files into work sessions", async () => {
    const { service } = await setup();
    const snapshot = await service.getSnapshot();

    expect(snapshot.session.mode).toBe("work");
    expect(snapshot.sessions.find((session) => session.id === "current")).toMatchObject({ mode: "work", scope: "workspace" });
  });

  it("creates a same-mode replacement before trashing the active session", async () => {
    const { service, trashed, sessions } = await setup();
    const snapshot = await service.deleteSession("current");
    expect(trashed).toEqual([join(sessions, "current.jsonl")]);
    expect(snapshot.session).toMatchObject({ id: "replacement", mode: "work" });
    expect(snapshot.sessions.some((session) => session.id === "current")).toBe(false);
  });

  it("keeps pure chats in a dedicated global session directory", async () => {
    const { service, fakePi, cwd, chatSessions } = await setup();
    const initial = await service.getSnapshot();
    expect(initial.sessions.find((session) => session.id === "global-chat")).toMatchObject({ scope: "global" });

    await service.switchSession("global-chat");

    expect(fakePi.getStatus().cwd).toBe(cwd);
    expect(fakePi.restarts).toEqual([]);
    expect(latestSwitchCommand(fakePi.commands)).toMatchObject({
      sessionPath: expect.stringContaining("global-chat.jsonl"),
      cwdOverride: cwd,
    });
  });

  it("creates future pure chats in the global session directory", async () => {
    const { service, fakePi, cwd, chatSessions } = await setup();
    const snapshot = await service.newSession("chat");

    expect(fakePi.restarts).toEqual([]);
    expect([...fakePi.commands].reverse().find((command) => command.type === "new_session")).toMatchObject({
      type: "new_session",
      sessionDir: chatSessions,
    });
    expect(snapshot.session).toMatchObject({ id: "replacement", mode: "chat" });
    expect(snapshot.sessions.find((session) => session.id === "replacement")).toMatchObject({ mode: "chat", scope: "global" });
  });

  it("switches to a work session's original workspace before resuming it", async () => {
    const { service, fakePi, otherWorkspace } = await setup();
    await service.getSnapshot();
    const modelRequestsBeforeSwitch = fakePi.commands.filter((command) => command.type === "get_available_models").length;
    const thinkingRequestsBeforeSwitch = fakePi.commands.filter((command) => command.type === "get_available_thinking_levels").length;
    const commandRequestsBeforeSwitch = fakePi.commands.filter((command) => command.type === "get_commands").length;

    const snapshot = await service.switchSession("other-work");

    expect(fakePi.getStatus().cwd).toBe(otherWorkspace);
    expect(fakePi.restarts).toEqual([]);
    expect(snapshot.session.id).toBe("other-work");
    expect(latestSwitchCommand(fakePi.commands)).toMatchObject({
      sessionPath: expect.stringContaining("other-work.jsonl"),
    });
    expect(fakePi.commands.filter((command) => command.type === "get_available_models")).toHaveLength(modelRequestsBeforeSwitch);
    expect(fakePi.commands.filter((command) => command.type === "get_commands")).toHaveLength(commandRequestsBeforeSwitch);
    expect(fakePi.commands.filter((command) => command.type === "get_available_thinking_levels")).toHaveLength(thinkingRequestsBeforeSwitch + 1);
  });

  it("refreshes model-specific thinking levels when switching sessions", async () => {
    const { service, fakePi } = await setup();
    fakePi.thinkingLevelBySession.set("current", "high");
    fakePi.thinkingLevelsBySession.set("current", ["off", "high", "max"]);
    fakePi.thinkingLevelBySession.set("other-work", "low");
    fakePi.thinkingLevelsBySession.set("other-work", ["off", "low", "high", "max"]);

    const initial = await service.getSnapshot();
    expect(initial.session.thinkingLevel).toBe("high");
    expect(initial.thinkingLevels).toEqual(["off", "high", "max"]);

    const switched = await service.switchSession("other-work");
    expect(switched.session.thinkingLevel).toBe("low");
    expect(switched.thinkingLevels).toEqual(["off", "low", "high", "max"]);
  });

  it("forwards branch summary options when navigating the session tree", async () => {
    const { service, fakePi } = await setup();
    const result = await service.navigateCurrentSessionTree("message-1", {
      summarize: true,
      customInstructions: "保留测试结果",
      replaceInstructions: true,
    });

    expect(fakePi.commands.find((command) => command.type === "navigate_tree")).toEqual({
      type: "navigate_tree",
      targetId: "message-1",
      summarize: true,
      customInstructions: "保留测试结果",
      replaceInstructions: true,
    });
    expect(result.editorText).toBe("restored draft");
  });

  it("drops an empty current session from recents after switching away", async () => {
    const { service, sessions } = await setup();
    await rm(join(sessions, "current.jsonl"));

    const initial = await service.getSnapshot();
    expect(initial.sessions.find((session) => session.id === "current")).toMatchObject({ current: true, messageCount: 0 });

    const switched = await service.switchSession("older");
    expect(switched.sessions.some((session) => session.id === "current")).toBe(false);
    expect(switched.sessions.find((session) => session.id === "older")?.current).toBe(true);
  });
});
