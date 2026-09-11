import { create } from "zustand";
import type { AgentEvent } from "../../shared/contracts/agent-events";
import type { AgentRuntimeSnapshot } from "../../shared/contracts/agent-session";
import type { ProcessStatus } from "../../shared/rpc";
import {
  createInitialAgentRuntimeState,
  reduceAgentEvent,
  type AgentRuntimeState,
} from "../lib/event-reducer";

const initialProcessStatus: ProcessStatus = { state: "starting", cwd: "" };

type AgentStore = AgentRuntimeState & {
  processStatus: ProcessStatus;
  applyAgentEvent: (event: AgentEvent) => void;
  setProcessStatus: (status: ProcessStatus) => void;
  setError: (message: string | null) => void;
  dismissInteraction: (id: string) => void;
  hydrateRuntimeSnapshot: (snapshot: AgentRuntimeSnapshot) => void;
  resetSession: () => void;
};

export const useAgentStore = create<AgentStore>((set) => ({
  ...createInitialAgentRuntimeState(),
  processStatus: initialProcessStatus,
  applyAgentEvent: (event) => set((state) => reduceAgentEvent(state, event)),
  setProcessStatus: (processStatus) => set((state) => ({
    processStatus,
    busy: processStatus.state === "running" ? state.busy : false,
  })),
  setError: (error) => set({ error }),
  dismissInteraction: (id) => set((state) => ({
    interactionRequests: state.interactionRequests.filter((request) => request.id !== id),
  })),
  hydrateRuntimeSnapshot: (snapshot) => set((state) => ({
    ...createInitialAgentRuntimeState(),
    processStatus: state.processStatus,
    busy: snapshot.session.isStreaming,
    messagesById: Object.fromEntries(snapshot.history.messages.map((message) => [message.id, message])),
    toolCallsById: Object.fromEntries(snapshot.history.toolCalls.map((tool) => [tool.id, tool])),
    timelineOrder: snapshot.history.timeline,
    compaction: snapshot.session.isCompacting ? { phase: "running" } : { phase: "idle" },
    activeSessionId: snapshot.session.id,
    lastSequence: snapshot.sequence,
    activityRevision: state.activityRevision + 1,
  })),
  resetSession: () => set((state) => ({
    ...createInitialAgentRuntimeState(),
    processStatus: state.processStatus,
  })),
}));
