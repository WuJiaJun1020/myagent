import { create } from "zustand";
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
import { agentGateway } from "../services/agent-gateway";
import { useAgentStore } from "./agent-store";
import { useSettingsStore } from "./settings-store";
import { useUiStore } from "./ui-store";
import { useResourceStore } from "./resource-store";

type SessionMutation = "initializing" | "session" | "rename" | "delete" | "mode" | "approval" | "model" | "thinking" | null;

type SessionStore = {
  session: AgentSessionState | null;
  sessions: SessionListItem[];
  models: DesktopModel[];
  thinkingLevels: ThinkingLevel[];
  commands: SlashCommand[];
  mutation: SessionMutation;
  error: string | null;
  initialize: (cwd: string) => Promise<void>;
  createSession: (mode?: SessionMode) => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  setSessionMode: (mode: SessionMode) => Promise<void>;
  setApprovalPolicy: (policy: ApprovalPolicy) => Promise<void>;
  selectModel: (provider: string, modelId: string) => Promise<void>;
  selectThinkingLevel: (level: ThinkingLevel) => Promise<void>;
  refreshSessionState: () => Promise<void>;
  prepareWorkspaceTransition: () => void;
  clearError: () => void;
  reset: () => void;
};

let operationGeneration = 0;

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function applySnapshot(snapshot: AgentRuntimeSnapshot, cwd: string): void {
  useAgentStore.getState().hydrateRuntimeSnapshot(snapshot);
  useUiStore.getState().clearDetailSelection();
  if (cwd && snapshot.session.mode === "work") useSettingsStore.getState().rememberSession(cwd, snapshot.session.id);
  if (snapshot.session.model) {
    useSettingsStore.getState().setPreferredModel(snapshot.session.model.provider, snapshot.session.model.id);
  }
  useSettingsStore.getState().setPreferredThinkingLevel(snapshot.session.thinkingLevel);
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  session: null,
  sessions: [],
  models: [],
  thinkingLevels: ["off"],
  commands: [],
  mutation: null,
  error: null,

  initialize: async (cwd) => {
    if (!cwd) return;
    const generation = ++operationGeneration;
    set({ mutation: "initializing", error: null });
    try {
      let snapshot = await agentGateway.getRuntimeSnapshot();
      const rememberedSessionId = useSettingsStore.getState().lastSessionByWorkspace[cwd];
      if (
        rememberedSessionId
        && rememberedSessionId !== snapshot.session.id
        && snapshot.sessions.some((session) => session.id === rememberedSessionId && session.mode === "work")
      ) {
        snapshot = await agentGateway.switchSession(rememberedSessionId);
      }
      if (generation !== operationGeneration) return;
      applySnapshot(snapshot, cwd);
      set({
        session: snapshot.session,
        sessions: snapshot.sessions,
        models: snapshot.models,
        thinkingLevels: snapshot.thinkingLevels,
        commands: snapshot.commands,
        mutation: null,
        error: null,
      });
    } catch (reason) {
      if (generation === operationGeneration) set({ mutation: null, error: errorMessage(reason) });
    }
  },

  createSession: async (mode) => {
    const generation = ++operationGeneration;
    set({ mutation: "session", error: null });
    try {
      const snapshot = await agentGateway.newSession(mode ?? get().session?.mode ?? "work");
      if (generation !== operationGeneration) return;
      const cwd = useAgentStore.getState().processStatus.cwd;
      applySnapshot(snapshot, cwd);
      void useResourceStore.getState().initialize(cwd);
      set({ session: snapshot.session, sessions: snapshot.sessions, models: snapshot.models, thinkingLevels: snapshot.thinkingLevels, commands: snapshot.commands, mutation: null });
    } catch (reason) {
      if (generation === operationGeneration) set({ mutation: null, error: errorMessage(reason) });
    }
  },

  switchSession: async (sessionId) => {
    if (get().session?.id === sessionId) return;
    const generation = ++operationGeneration;
    set({ mutation: "session", error: null });
    try {
      const snapshot = await agentGateway.switchSession(sessionId);
      if (generation !== operationGeneration) return;
      const cwd = useAgentStore.getState().processStatus.cwd;
      applySnapshot(snapshot, cwd);
      void useResourceStore.getState().initialize(cwd);
      set({ session: snapshot.session, sessions: snapshot.sessions, models: snapshot.models, thinkingLevels: snapshot.thinkingLevels, commands: snapshot.commands, mutation: null });
    } catch (reason) {
      if (generation === operationGeneration) set({ mutation: null, error: errorMessage(reason) });
    }
  },

  renameSession: async (sessionId, name) => {
    const generation = ++operationGeneration;
    set({ mutation: "rename", error: null });
    try {
      const snapshot = await agentGateway.renameSession(sessionId, name);
      if (generation !== operationGeneration) return;
      const cwd = useAgentStore.getState().processStatus.cwd;
      applySnapshot(snapshot, cwd);
      set({ session: snapshot.session, sessions: snapshot.sessions, models: snapshot.models, thinkingLevels: snapshot.thinkingLevels, commands: snapshot.commands, mutation: null });
    } catch (reason) {
      if (generation === operationGeneration) set({ mutation: null, error: errorMessage(reason) });
    }
  },

  deleteSession: async (sessionId) => {
    const generation = ++operationGeneration;
    set({ mutation: "delete", error: null });
    try {
      const snapshot = await agentGateway.deleteSession(sessionId);
      if (generation !== operationGeneration) return;
      const cwd = useAgentStore.getState().processStatus.cwd;
      applySnapshot(snapshot, cwd);
      void useResourceStore.getState().initialize(cwd);
      set({ session: snapshot.session, sessions: snapshot.sessions, models: snapshot.models, thinkingLevels: snapshot.thinkingLevels, commands: snapshot.commands, mutation: null });
    } catch (reason) {
      if (generation === operationGeneration) set({ mutation: null, error: errorMessage(reason) });
    }
  },

  setSessionMode: async (mode) => {
    if (get().session?.mode === mode) return;
    const generation = ++operationGeneration;
    set({ mutation: "mode", error: null });
    try {
      const snapshot = await agentGateway.setSessionMode(mode);
      if (generation !== operationGeneration) return;
      const cwd = useAgentStore.getState().processStatus.cwd;
      applySnapshot(snapshot, cwd);
      void useResourceStore.getState().initialize(cwd);
      set({ session: snapshot.session, sessions: snapshot.sessions, models: snapshot.models, thinkingLevels: snapshot.thinkingLevels, commands: snapshot.commands, mutation: null });
    } catch (reason) {
      if (generation === operationGeneration) set({ mutation: null, error: errorMessage(reason) });
    }
  },

  setApprovalPolicy: async (policy) => {
    if (get().session?.approvalPolicy === policy) return;
    const generation = ++operationGeneration;
    set({ mutation: "approval", error: null });
    try {
      const snapshot = await agentGateway.setApprovalPolicy(policy);
      if (generation !== operationGeneration) return;
      const cwd = useAgentStore.getState().processStatus.cwd;
      applySnapshot(snapshot, cwd);
      set({
        session: snapshot.session,
        sessions: snapshot.sessions,
        models: snapshot.models,
        thinkingLevels: snapshot.thinkingLevels,
        commands: snapshot.commands,
        mutation: null,
      });
    } catch (reason) {
      if (generation === operationGeneration) set({ mutation: null, error: errorMessage(reason) });
    }
  },

  selectModel: async (provider, modelId) => {
    const generation = ++operationGeneration;
    set({ mutation: "model", error: null });
    try {
      const snapshot = await agentGateway.setModel(provider, modelId);
      if (generation !== operationGeneration) return;
      const cwd = useAgentStore.getState().processStatus.cwd;
      applySnapshot(snapshot, cwd);
      set({ session: snapshot.session, sessions: snapshot.sessions, models: snapshot.models, thinkingLevels: snapshot.thinkingLevels, commands: snapshot.commands, mutation: null });
    } catch (reason) {
      if (generation === operationGeneration) set({ mutation: null, error: errorMessage(reason) });
    }
  },

  selectThinkingLevel: async (level) => {
    const generation = ++operationGeneration;
    set({ mutation: "thinking", error: null });
    try {
      const snapshot = await agentGateway.setThinkingLevel(level);
      if (generation !== operationGeneration) return;
      const cwd = useAgentStore.getState().processStatus.cwd;
      applySnapshot(snapshot, cwd);
      set({ session: snapshot.session, sessions: snapshot.sessions, models: snapshot.models, thinkingLevels: snapshot.thinkingLevels, commands: snapshot.commands, mutation: null });
    } catch (reason) {
      if (generation === operationGeneration) set({ mutation: null, error: errorMessage(reason) });
    }
  },

  refreshSessionState: async () => {
    if (get().mutation !== null || !get().session) return;
    try {
      const session = await agentGateway.getSessionState();
      if (get().session?.id === session.id) set({ session });
    } catch {
      // A settled event can race with process shutdown or a session switch.
    }
  },

  prepareWorkspaceTransition: () => set({
    session: null,
    models: [],
    thinkingLevels: ["off"],
    commands: [],
    error: null,
  }),

  clearError: () => set({ error: null }),
  reset: () => {
    operationGeneration += 1;
    set({
      session: null,
      sessions: [],
      models: [],
      thinkingLevels: ["off"],
      commands: [],
      mutation: null,
      error: null,
    });
  },
}));
