import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntimeSnapshot, DesktopModel, SessionListItem, ThinkingLevel } from "../../shared/contracts/agent-session";
import { agentGateway } from "../services/agent-gateway";
import { useAgentStore } from "./agent-store";
import { useResourceStore } from "./resource-store";
import { mergeCachedFileChanges, useSessionStore } from "./session-store";
import { useSettingsStore } from "./settings-store";

const originalResourceInitialize = useResourceStore.getState().initialize;
const originalPreferredModel = useSettingsStore.getState().preferredModel;
const originalPreferredThinkingLevelValue = useSettingsStore.getState().preferredThinkingLevel;
const originalSetPreferredModel = useSettingsStore.getState().setPreferredModel;
const originalPreferredThinkingLevel = useSettingsStore.getState().setPreferredThinkingLevel;

const modelA: DesktopModel = {
  provider: "provider-a",
  id: "model-a",
  name: "Model A",
  api: "test",
  reasoning: true,
  supportsImages: true,
  contextWindow: 128_000,
  maxTokens: 8_000,
};

const modelB: DesktopModel = { ...modelA, provider: "provider-b", id: "model-b", name: "Model B" };

function sessionList(currentId: string): SessionListItem[] {
  return ["instant-a", "instant-b"].map((id) => ({
    id,
    name: id,
    mode: "chat",
    scope: "global",
    firstMessage: id,
    createdAt: 1,
    modifiedAt: 1,
    messageCount: 1,
    current: id === currentId,
  }));
}

function snapshot(
  id: string,
  text: string,
  model?: DesktopModel,
  thinkingLevel: ThinkingLevel = "off",
): AgentRuntimeSnapshot {
  return {
    sequence: 1,
    session: {
      id,
      name: id,
      mode: "chat",
      approvalPolicy: "auto",
      thinkingLevel,
      isStreaming: false,
      isCompacting: false,
      isRetrying: false,
      steeringMode: "all",
      followUpMode: "all",
      autoCompactionEnabled: true,
      autoRetryEnabled: true,
      messageCount: 1,
      pendingMessageCount: 0,
      model,
    },
    sessions: sessionList(id),
    models: model ? [modelA, modelB] : [],
    thinkingLevels: model ? ["off", "low", "medium", "high"] : ["off"],
    commands: [],
    history: {
      messages: [{
        id: `${id}:message`,
        role: "assistant",
        content: [{ type: "text", contentIndex: 0, text }],
        timestamp: 1,
        streaming: false,
      }],
      toolCalls: [],
      timeline: [{ type: "message", id: `${id}:message` }],
    },
  };
}

describe("session switch presentation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useResourceStore.setState({ initialize: originalResourceInitialize });
    useSettingsStore.setState({
      preferredModel: originalPreferredModel,
      preferredThinkingLevel: originalPreferredThinkingLevelValue,
      setPreferredModel: originalSetPreferredModel,
      setPreferredThinkingLevel: originalPreferredThinkingLevel,
    });
    useSessionStore.getState().reset();
  });

  it("presents a previously visited session before the background RPC finishes", async () => {
    const cwd = "D:\\workspace";
    const first = snapshot("instant-a", "cached A");
    const second = snapshot("instant-b", "cached B");
    const fileChange = {
      path: "src/app.ts",
      changeType: "modified" as const,
      beforeContent: "old\n",
      afterContent: "new\n",
      unifiedDiff: "@@ -1 +1 @@\n-old\n+new",
      toolCallId: "edit-1",
      timestamp: 2,
    };
    const tool = {
      id: "edit-1",
      name: "edit",
      args: { path: "src/app.ts" },
      output: [],
      status: "done" as const,
      startedAt: 1,
      completedAt: 2,
    };
    first.history.toolCalls = [tool];
    first.history.timeline.push({ type: "tool", id: tool.id });
    let finishSwitch!: (value: AgentRuntimeSnapshot) => void;
    const delayedSwitch = new Promise<AgentRuntimeSnapshot>((resolve) => {
      finishSwitch = resolve;
    });

    vi.spyOn(agentGateway, "getRuntimeSnapshot").mockResolvedValue(first);
    vi.spyOn(agentGateway, "switchSession")
      .mockResolvedValueOnce(second)
      .mockReturnValueOnce(delayedSwitch);
    const initializeResources = vi.fn(async () => undefined);
    useResourceStore.setState({ initialize: initializeResources });
    useSettingsStore.setState({ setPreferredThinkingLevel: vi.fn() });
    useAgentStore.getState().resetSession();
    useAgentStore.getState().setProcessStatus({ state: "running", cwd });

    await useSessionStore.getState().initialize(cwd);
    useAgentStore.setState((state) => ({
      toolCallsById: {
        ...state.toolCallsById,
        [tool.id]: { ...tool, fileChange },
      },
    }));
    await useSessionStore.getState().switchSession("instant-b");

    const pending = useSessionStore.getState().switchSession("instant-a");
    expect(useSessionStore.getState()).toMatchObject({
      session: { id: "instant-a" },
      pendingSessionId: "instant-a",
      mutation: "session",
    });
    expect(useAgentStore.getState().messagesById["instant-a:message"]?.content[0]).toMatchObject({
      text: "cached A",
    });

    finishSwitch(first);
    await pending;
    expect(useSessionStore.getState()).toMatchObject({
      session: { id: "instant-a" },
      pendingSessionId: null,
      mutation: null,
    });
    expect(useAgentStore.getState().toolCallsById[tool.id]?.fileChange).toEqual(fileChange);
    expect(initializeResources).not.toHaveBeenCalled();
  });

  it("keeps client-captured file changes after the authoritative session snapshot arrives", () => {
    const server = snapshot("instant-a", "server history");
    const cached = snapshot("instant-a", "cached history");
    const fileChange = {
      path: "src/app.ts",
      changeType: "modified" as const,
      beforeContent: "old\n",
      afterContent: "new\n",
      unifiedDiff: "@@ -1 +1 @@\n-old\n+new",
      toolCallId: "edit-1",
      timestamp: 2,
    };
    const tool = {
      id: "edit-1",
      name: "edit",
      args: { path: "src/app.ts" },
      output: [],
      status: "done" as const,
      startedAt: 1,
      completedAt: 2,
    };
    server.history.toolCalls = [tool];
    server.history.timeline.push({ type: "tool", id: tool.id });
    cached.history.toolCalls = [{ ...tool, fileChange }];

    expect(mergeCachedFileChanges(server, cached).history.toolCalls[0]?.fileChange).toEqual(fileChange);
  });

  it("keeps client-captured turn diffs after switching away and back", () => {
    const server = snapshot("instant-a", "server history");
    const cached = snapshot("instant-a", "cached history");
    const userMessage = {
      id: "instant-a:user",
      role: "user" as const,
      content: [{ type: "text" as const, contentIndex: 0, text: "修改文件" }],
      timestamp: 0,
      streaming: false,
    };
    server.history.messages.unshift(userMessage);
    server.history.timeline.unshift({ type: "message", id: userMessage.id });
    cached.history.messages.unshift(userMessage);
    cached.history.timeline.unshift({ type: "message", id: userMessage.id });
    const changes = [{
      path: "src/generated.ts",
      changeType: "created" as const,
      afterContent: "export {};\n",
      unifiedDiff: "+export {};",
      timestamp: 2,
    }];
    cached.history.turnFileChanges = [{ turnIndex: 0, changes }];

    expect(mergeCachedFileChanges(server, cached).history.turnFileChanges).toEqual([
      { turnIndex: 0, changes },
    ]);
  });

  it("applies the preferred model and thinking level to a new session", async () => {
    const created = snapshot("new", "", modelB, "medium");
    const withPreferredModel = snapshot("new", "", modelA, "medium");
    const configured = snapshot("new", "", modelA, "low");
    vi.spyOn(agentGateway, "newSession").mockResolvedValue(created);
    const setModel = vi.spyOn(agentGateway, "setModel").mockResolvedValue(withPreferredModel);
    const setThinkingLevel = vi.spyOn(agentGateway, "setThinkingLevel").mockResolvedValue(configured);
    useResourceStore.setState({ initialize: vi.fn(async () => undefined) });
    useSettingsStore.setState({
      preferredModel: { provider: modelA.provider, id: modelA.id },
      preferredThinkingLevel: "low",
      setPreferredModel: vi.fn(),
      setPreferredThinkingLevel: vi.fn(),
    });

    await useSessionStore.getState().createSession("work");

    expect(setModel).toHaveBeenCalledWith(modelA.provider, modelA.id);
    expect(setThinkingLevel).toHaveBeenCalledWith("low");
    expect(useSessionStore.getState()).toMatchObject({
      session: { id: "new", model: modelA, thinkingLevel: "low" },
      mutation: null,
      error: null,
    });
  });

  it("keeps Pi defaults when the preferred model is unavailable", async () => {
    const created = snapshot("new", "", modelB, "medium");
    vi.spyOn(agentGateway, "newSession").mockResolvedValue(created);
    const setModel = vi.spyOn(agentGateway, "setModel");
    const setThinkingLevel = vi.spyOn(agentGateway, "setThinkingLevel");
    useResourceStore.setState({ initialize: vi.fn(async () => undefined) });
    useSettingsStore.setState({
      preferredModel: { provider: "missing", id: "missing" },
      preferredThinkingLevel: "low",
      setPreferredModel: vi.fn(),
      setPreferredThinkingLevel: vi.fn(),
    });

    await useSessionStore.getState().createSession("chat");

    expect(setModel).not.toHaveBeenCalled();
    expect(setThinkingLevel).not.toHaveBeenCalled();
    expect(useSessionStore.getState().session).toMatchObject({ model: modelB, thinkingLevel: "medium" });
  });
});
