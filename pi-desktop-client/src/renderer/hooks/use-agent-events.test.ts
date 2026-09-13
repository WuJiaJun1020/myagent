import { afterEach, describe, expect, it } from "vitest";
import type { AgentRuntimeSnapshot } from "../../shared/contracts/agent-session";
import { useAgentStore } from "../stores/agent-store";
import { useSessionStore } from "../stores/session-store";
import { applyProcessStatus } from "./use-agent-events";

function snapshot(): AgentRuntimeSnapshot {
  return {
    sequence: 1,
    session: {
      id: "source-session",
      name: "source-session",
      mode: "work",
      approvalPolicy: "auto",
      thinkingLevel: "off",
      isStreaming: false,
      isCompacting: false,
      isRetrying: false,
      steeringMode: "all",
      followUpMode: "all",
      autoCompactionEnabled: true,
      autoRetryEnabled: true,
      messageCount: 1,
      pendingMessageCount: 0,
    },
    sessions: [],
    models: [],
    thinkingLevels: ["off"],
    commands: [],
    history: {
      messages: [{
        id: "source-message",
        role: "assistant",
        content: [{ type: "text", contentIndex: 0, text: "Keep visible while switching" }],
        timestamp: 1,
        streaming: false,
      }],
      toolCalls: [],
      timeline: [{ type: "message", id: "source-message" }],
    },
  };
}

describe("agent process status presentation", () => {
  afterEach(() => {
    useSessionStore.getState().reset();
    useAgentStore.getState().resetSession();
  });

  it("keeps the current conversation visible while a session switch changes cwd", () => {
    const current = snapshot();
    useAgentStore.getState().setProcessStatus({ state: "running", cwd: "D:\\source" });
    useAgentStore.getState().hydrateRuntimeSnapshot(current);
    useSessionStore.setState({ session: current.session, mutation: "session", pendingSessionId: "target-session" });

    applyProcessStatus({ state: "running", cwd: "D:\\target" });

    expect(useAgentStore.getState().timelineOrder).toEqual([{ type: "message", id: "source-message" }]);
    expect(useAgentStore.getState().messagesById["source-message"]).toBeDefined();
    expect(useSessionStore.getState().session?.id).toBe("source-session");
    expect(useAgentStore.getState().processStatus.cwd).toBe("D:\\target");
  });
});
