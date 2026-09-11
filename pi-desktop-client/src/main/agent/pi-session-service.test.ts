import { appendFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionMode } from "../../shared/contracts/agent-session";
import type { RpcCommand, RpcMessage } from "../../shared/rpc";
import { PiEventAdapter } from "./pi-event-adapter";
import { PiSessionService } from "./pi-session-service";
import type { PiProcess } from "../pi-process";

const temporaryDirectories: string[] = [];

class FakePi {
  currentId = "current";
  currentMode: SessionMode = "chat";
  currentApprovalPolicy: "ask" | "auto" = "auto";

  constructor(
    private readonly cwd: string,
    private readonly sessionDirectory: string,
  ) {}

  getStatus() {
    return { state: "running" as const, cwd: this.cwd };
  }

  async send(command: RpcCommand): Promise<RpcMessage> {
    const sessionFile = join(this.sessionDirectory, `${this.currentId}.jsonl`);
    if (command.type === "get_state") {
      return { type: "response", command: command.type, success: true, data: {
        sessionId: this.currentId,
        sessionFile,
        sessionMode: this.currentMode,
        approvalPolicy: this.currentApprovalPolicy,
        contextUsage: { tokens: 1234, contextWindow: 32_000, percent: 3.85625 },
        thinkingLevel: "off",
        isStreaming: false,
        isCompacting: false,
        messageCount: 0,
        pendingMessageCount: 0,
      } };
    }
    if (command.type === "get_messages") return { type: "response", command: command.type, success: true, data: { messages: [] } };
    if (command.type === "get_available_models") return { type: "response", command: command.type, success: true, data: { models: [] } };
    if (command.type === "get_available_thinking_levels") return { type: "response", command: command.type, success: true, data: { levels: ["off"] } };
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
      await writeFile(sessionFile.replace("current.jsonl", "replacement.jsonl"), `${JSON.stringify({ type: "session", id: this.currentId, cwd: this.cwd, timestamp: new Date().toISOString() })}\n`, "utf8");
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
    throw new Error(`Unexpected command: ${command.type}`);
  }
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "pi-desktop-session-service-"));
  temporaryDirectories.push(root);
  const cwd = join(root, "workspace");
  const sessions = join(root, "sessions");
  await mkdir(cwd);
  await mkdir(sessions);
  for (const id of ["current", "older"]) {
    await writeFile(join(sessions, `${id}.jsonl`), `${JSON.stringify({ type: "session", id, cwd, timestamp: new Date().toISOString() })}\n`, "utf8");
  }
  const fakePi = new FakePi(cwd, sessions);
  const trashed: string[] = [];
  const service = new PiSessionService(fakePi as unknown as PiProcess, new PiEventAdapter(), async (path) => {
    trashed.push(path);
    await rm(path);
  });
  return { service, trashed, sessions };
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

  it("creates a same-mode replacement before trashing the active session", async () => {
    const { service, trashed, sessions } = await setup();
    const snapshot = await service.deleteSession("current");
    expect(trashed).toEqual([join(sessions, "current.jsonl")]);
    expect(snapshot.session).toMatchObject({ id: "replacement", mode: "chat" });
    expect(snapshot.sessions.some((session) => session.id === "current")).toBe(false);
  });
});
