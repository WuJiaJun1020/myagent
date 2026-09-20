import { create } from "zustand";
import type {
  AgentRuntimeSnapshot,
  AgentSessionState,
  ApprovalPolicy,
  DesktopModel,
  QueueProcessingMode,
  SessionListItem,
  SessionMode,
  SessionTreeNavigationOptions,
  SlashCommand,
  ThinkingLevel,
} from "../../shared/contracts/agent-session";
import { normalizeThinkingLevels } from "../../shared/thinking-levels";
import { agentGateway } from "../services/agent-gateway";
import { useAgentStore } from "./agent-store";
import { useSettingsStore } from "./settings-store";
import { useUiStore } from "./ui-store";
import { useResourceStore } from "./resource-store";

type SessionMutation = "initializing" | "session" | "session-tools" | "rename" | "delete" | "mode" | "approval" | "queue-policy" | "model" | "thinking" | null;

type SessionStore = {
  session: AgentSessionState | null;
  sessions: SessionListItem[];
  models: DesktopModel[];
  thinkingLevels: ThinkingLevel[];
  commands: SlashCommand[];
  mutation: SessionMutation;
  pendingSessionId: string | null;
  error: string | null;
  initialize: (cwd: string) => Promise<void>;
  createSession: (mode?: SessionMode) => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
  cloneSession: () => Promise<void>;
  forkSession: (entryId: string) => Promise<void>;
  navigateSessionTree: (entryId: string, options: SessionTreeNavigationOptions) => Promise<void>;
  importSession: () => Promise<void>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  setSessionMode: (mode: SessionMode) => Promise<void>;
  setApprovalPolicy: (policy: ApprovalPolicy) => Promise<void>;
  setSteeringMode: (mode: QueueProcessingMode) => Promise<void>;
  setFollowUpMode: (mode: QueueProcessingMode) => Promise<void>;
  setAutoCompaction: (enabled: boolean) => Promise<void>;
  setAutoRetry: (enabled: boolean) => Promise<void>;
  selectModel: (provider: string, modelId: string) => Promise<void>;
  selectThinkingLevel: (level: ThinkingLevel) => Promise<void>;
  refreshSessionState: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
};

let operationGeneration = 0;
const sessionSnapshotCache = new Map<string, { cwd: string; snapshot: AgentRuntimeSnapshot }>();
const MAX_CACHED_SESSIONS = 8;

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function rememberSnapshot(snapshot: AgentRuntimeSnapshot, cwd: string): void {
  sessionSnapshotCache.delete(snapshot.session.id);
  sessionSnapshotCache.set(snapshot.session.id, { cwd, snapshot });
  if (sessionSnapshotCache.size <= MAX_CACHED_SESSIONS) return;
  const oldest = sessionSnapshotCache.keys().next().value;
  if (typeof oldest === "string") sessionSnapshotCache.delete(oldest);
}

export function mergeCachedFileChanges(
  snapshot: AgentRuntimeSnapshot,
  cachedSnapshot: AgentRuntimeSnapshot | undefined,
): AgentRuntimeSnapshot {
  if (!cachedSnapshot) return snapshot;
  const changesByToolId = new Map(cachedSnapshot.history.toolCalls.flatMap((tool) => {
    const fileChanges = tool.fileChanges ?? (tool.fileChange ? [tool.fileChange] : []);
    return fileChanges.length > 0 ? [[tool.id, fileChanges] as const] : [];
  }));
  const userTurnCount = snapshot.history.messages.filter((message) => message.role === "user").length;
  const turnFileChanges = [
    ...(cachedSnapshot.history.turnFileChanges ?? []),
    ...(snapshot.history.turnFileChanges ?? []),
  ].reduce((entries, entry) => {
    if (entry.turnIndex >= 0 && entry.turnIndex < userTurnCount) entries.set(entry.turnIndex, entry);
    return entries;
  }, new Map<number, NonNullable<AgentRuntimeSnapshot["history"]["turnFileChanges"]>[number]>());
  if (changesByToolId.size === 0 && turnFileChanges.size === 0) return snapshot;
  return {
    ...snapshot,
    history: {
      ...snapshot.history,
      turnFileChanges: [...turnFileChanges.values()].sort((left, right) => left.turnIndex - right.turnIndex),
      toolCalls: snapshot.history.toolCalls.map((tool) => {
        const fileChanges = changesByToolId.get(tool.id);
        return fileChanges ? { ...tool, fileChange: fileChanges.at(-1), fileChanges } : tool;
      }),
    },
  };
}

function captureCurrentSnapshot(state: SessionStore, cwd: string): AgentRuntimeSnapshot | undefined {
  if (!state.session) return undefined;
  const runtime = useAgentStore.getState();
  const toolCalls = Object.values(runtime.toolCallsById).flatMap((tool) => tool.status === "running" ? [] : [{
    id: tool.id,
    name: tool.name,
    args: tool.args,
    output: tool.output,
    status: tool.status,
    startedAt: tool.startedAt,
    ...(tool.completedAt === undefined ? {} : { completedAt: tool.completedAt }),
    ...(tool.fileChange ? { fileChange: tool.fileChange } : {}),
    ...(tool.fileChanges ? { fileChanges: tool.fileChanges } : {}),
  }]);
  const snapshot: AgentRuntimeSnapshot = {
    sequence: runtime.lastSequence,
    session: state.session,
    sessions: state.sessions,
    models: state.models,
    thinkingLevels: state.thinkingLevels,
    commands: state.commands,
    history: {
      messages: Object.values(runtime.messagesById),
      toolCalls,
      timeline: runtime.timelineOrder,
      turnFileChanges: Object.entries(runtime.turnFileChangesByIndex)
        .map(([turnIndex, changes]) => ({ turnIndex: Number(turnIndex), changes }))
        .sort((left, right) => left.turnIndex - right.turnIndex),
    },
  };
  rememberSnapshot(snapshot, cwd);
  return snapshot;
}

function applySnapshot(snapshot: AgentRuntimeSnapshot, cwd: string): void {
  rememberSnapshot(snapshot, cwd);
  useAgentStore.getState().hydrateRuntimeSnapshot(snapshot);
  useUiStore.getState().clearDetailSelection();
  if (cwd && snapshot.session.mode === "work") useSettingsStore.getState().rememberSession(cwd, snapshot.session.id);
  if (snapshot.session.model) {
    useSettingsStore.getState().setPreferredModel(snapshot.session.model.provider, snapshot.session.model.id);
  }
  useSettingsStore.getState().setPreferredThinkingLevel(snapshot.session.thinkingLevel);
}

function syncSnapshotMetadata(snapshot: AgentRuntimeSnapshot): void {
  useAgentStore.getState().syncRuntimeSnapshotMetadata(snapshot);
}

type PreferredConfigurationResult = {
  snapshot: AgentRuntimeSnapshot;
  warning: string | null;
};

async function applyPreferredConfiguration(snapshot: AgentRuntimeSnapshot): Promise<PreferredConfigurationResult> {
  const { preferredModel, preferredThinkingLevel } = useSettingsStore.getState();
  if (!preferredModel) return { snapshot, warning: null };
  const modelAvailable = snapshot.models.some((model) => (
    model.provider === preferredModel.provider && model.id === preferredModel.id
  ));
  if (!modelAvailable) return { snapshot, warning: null };

  let configured = snapshot;
  try {
    if (
      configured.session.model?.provider !== preferredModel.provider
      || configured.session.model?.id !== preferredModel.id
    ) {
      configured = await agentGateway.setModel(preferredModel.provider, preferredModel.id);
    }
  } catch (reason) {
    return {
      snapshot: configured,
      warning: `新会话已创建，但无法应用首选模型：${errorMessage(reason)}`,
    };
  }

  const availableThinkingLevels = normalizeThinkingLevels(
    configured.thinkingLevels,
    configured.session.thinkingLevel,
  );
  if (
    configured.session.thinkingLevel !== preferredThinkingLevel
    && availableThinkingLevels.includes(preferredThinkingLevel)
  ) {
    try {
      configured = await agentGateway.setThinkingLevel(preferredThinkingLevel);
    } catch (reason) {
      return {
        snapshot: configured,
        warning: `新会话已创建，但无法应用首选思考深度：${errorMessage(reason)}`,
      };
    }
  }
  return { snapshot: configured, warning: null };
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  session: null,
  sessions: [],
  models: [],
  thinkingLevels: ["off"],
  commands: [],
  mutation: null,
  pendingSessionId: null,
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
      let snapshot = await agentGateway.newSession(mode ?? get().session?.mode ?? "work");
      const configured = await applyPreferredConfiguration(snapshot);
      snapshot = configured.snapshot;
      if (generation !== operationGeneration) return;
      const cwd = useAgentStore.getState().processStatus.cwd;
      applySnapshot(snapshot, cwd);
      void useResourceStore.getState().initialize(cwd);
      set({
        session: snapshot.session,
        sessions: snapshot.sessions,
        models: snapshot.models,
        thinkingLevels: snapshot.thinkingLevels,
        commands: snapshot.commands,
        mutation: null,
        error: configured.warning,
      });
    } catch (reason) {
      if (generation === operationGeneration) set({ mutation: null, error: errorMessage(reason) });
    }
  },

  switchSession: async (sessionId) => {
    const previousState = get();
    if (previousState.session?.id === sessionId) return;
    const generation = ++operationGeneration;
    const cwd = useAgentStore.getState().processStatus.cwd;
    const previousSnapshot = captureCurrentSnapshot(previousState, cwd);
    const target = previousState.sessions.find((candidate) => candidate.id === sessionId);
    const cached = sessionSnapshotCache.get(sessionId);
    const canPresentCached = Boolean(cached && (
      target?.mode === "chat"
      || cached.cwd === cwd
    ));
    set({ mutation: "session", pendingSessionId: sessionId, error: null });
    if (cached && canPresentCached) {
      const optimisticSnapshot: AgentRuntimeSnapshot = {
        ...cached.snapshot,
        sessions: previousState.sessions.map((candidate) => ({
          ...candidate,
          current: candidate.id === sessionId,
        })),
      };
      applySnapshot(optimisticSnapshot, cwd);
      set({
        session: optimisticSnapshot.session,
        sessions: optimisticSnapshot.sessions,
        models: optimisticSnapshot.models,
        thinkingLevels: optimisticSnapshot.thinkingLevels,
        commands: optimisticSnapshot.commands,
      });
    }
    try {
      const serverSnapshot = await agentGateway.switchSession(sessionId);
      if (generation !== operationGeneration) return;
      const snapshot = mergeCachedFileChanges(serverSnapshot, cached?.snapshot);
      const nextCwd = useAgentStore.getState().processStatus.cwd;
      applySnapshot(snapshot, nextCwd);
      if (nextCwd !== cwd || snapshot.session.mode !== previousState.session?.mode) {
        void useResourceStore.getState().initialize(nextCwd);
      }
      set({ session: snapshot.session, sessions: snapshot.sessions, models: snapshot.models, thinkingLevels: snapshot.thinkingLevels, commands: snapshot.commands, mutation: null, pendingSessionId: null });
    } catch (reason) {
      if (generation === operationGeneration) {
        if (cached && canPresentCached && previousSnapshot) {
          applySnapshot(previousSnapshot, cwd);
          set({
            session: previousSnapshot.session,
            sessions: previousSnapshot.sessions,
            models: previousSnapshot.models,
            thinkingLevels: previousSnapshot.thinkingLevels,
            commands: previousSnapshot.commands,
          });
        }
        set({ mutation: null, pendingSessionId: null, error: errorMessage(reason) });
      }
    }
  },

  cloneSession: async () => {
    const generation = ++operationGeneration;
    set({ mutation: "session-tools", error: null });
    try {
      const snapshot = await agentGateway.cloneCurrentSession();
      if (generation !== operationGeneration) return;
      const cwd = useAgentStore.getState().processStatus.cwd;
      applySnapshot(snapshot, cwd);
      void useResourceStore.getState().initialize(cwd);
      set({ session: snapshot.session, sessions: snapshot.sessions, models: snapshot.models, thinkingLevels: snapshot.thinkingLevels, commands: snapshot.commands, mutation: null });
    } catch (reason) {
      if (generation === operationGeneration) set({ mutation: null, error: errorMessage(reason) });
    }
  },

  forkSession: async (entryId) => {
    const generation = ++operationGeneration;
    set({ mutation: "session-tools", error: null });
    try {
      const snapshot = await agentGateway.forkCurrentSession(entryId);
      if (generation !== operationGeneration) return;
      const cwd = useAgentStore.getState().processStatus.cwd;
      applySnapshot(snapshot, cwd);
      void useResourceStore.getState().initialize(cwd);
      set({ session: snapshot.session, sessions: snapshot.sessions, models: snapshot.models, thinkingLevels: snapshot.thinkingLevels, commands: snapshot.commands, mutation: null });
    } catch (reason) {
      if (generation === operationGeneration) set({ mutation: null, error: errorMessage(reason) });
    }
  },

  navigateSessionTree: async (entryId, options) => {
    const generation = ++operationGeneration;
    set({ mutation: "session-tools", error: null });
    try {
      const result = await agentGateway.navigateSessionTree(entryId, options);
      if (generation !== operationGeneration) return;
      const cwd = useAgentStore.getState().processStatus.cwd;
      applySnapshot(result.snapshot, cwd);
      if (result.editorText !== undefined) useUiStore.getState().setComposerDraft(result.editorText);
      set({
        session: result.snapshot.session,
        sessions: result.snapshot.sessions,
        models: result.snapshot.models,
        thinkingLevels: result.snapshot.thinkingLevels,
        commands: result.snapshot.commands,
        mutation: null,
      });
    } catch (reason) {
      if (generation === operationGeneration) set({ mutation: null, error: errorMessage(reason) });
    }
  },

  importSession: async () => {
    const generation = ++operationGeneration;
    set({ mutation: "session-tools", error: null });
    try {
      const snapshot = await agentGateway.importSession();
      if (generation !== operationGeneration) return;
      if (snapshot === null) {
        set({ mutation: null });
        return;
      }
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
      syncSnapshotMetadata(snapshot);
      set({ session: snapshot.session, sessions: snapshot.sessions, mutation: null });
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
      const discardedDraft = useUiStore.getState().sessionComposerDrafts[sessionId];
      if (discardedDraft?.attachments.length) {
        void agentGateway.discardImages(discardedDraft.attachments.map((attachment) => attachment.id)).catch(() => undefined);
      }
      useUiStore.getState().removeSessionUiState(sessionId);
      sessionSnapshotCache.delete(sessionId);
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
    const previousSession = get().session;
    if (previousSession?.approvalPolicy === policy) return;
    const generation = ++operationGeneration;
    set({
      mutation: "approval",
      error: null,
      session: previousSession ? { ...previousSession, approvalPolicy: policy } : previousSession,
    });
    try {
      const snapshot = await agentGateway.setApprovalPolicy(policy);
      if (generation !== operationGeneration) return;
      syncSnapshotMetadata(snapshot);
      set({
        session: snapshot.session,
        mutation: null,
      });
    } catch (reason) {
      if (generation === operationGeneration) set({ session: previousSession, mutation: null, error: errorMessage(reason) });
    }
  },

  setSteeringMode: async (mode) => {
    const previousSession = get().session;
    if (previousSession?.steeringMode === mode) return;
    const generation = ++operationGeneration;
    set({
      mutation: "queue-policy",
      error: null,
      session: previousSession ? { ...previousSession, steeringMode: mode } : previousSession,
    });
    try {
      const snapshot = await agentGateway.setSteeringMode(mode);
      if (generation !== operationGeneration) return;
      syncSnapshotMetadata(snapshot);
      set({ session: snapshot.session, mutation: null });
    } catch (reason) {
      if (generation === operationGeneration) set({ session: previousSession, mutation: null, error: errorMessage(reason) });
    }
  },

  setFollowUpMode: async (mode) => {
    const previousSession = get().session;
    if (previousSession?.followUpMode === mode) return;
    const generation = ++operationGeneration;
    set({
      mutation: "queue-policy",
      error: null,
      session: previousSession ? { ...previousSession, followUpMode: mode } : previousSession,
    });
    try {
      const snapshot = await agentGateway.setFollowUpMode(mode);
      if (generation !== operationGeneration) return;
      syncSnapshotMetadata(snapshot);
      set({ session: snapshot.session, mutation: null });
    } catch (reason) {
      if (generation === operationGeneration) set({ session: previousSession, mutation: null, error: errorMessage(reason) });
    }
  },

  setAutoCompaction: async (enabled) => {
    const previousSession = get().session;
    if (previousSession?.autoCompactionEnabled === enabled) return;
    const generation = ++operationGeneration;
    set({
      mutation: "queue-policy",
      error: null,
      session: previousSession ? { ...previousSession, autoCompactionEnabled: enabled } : previousSession,
    });
    try {
      const snapshot = await agentGateway.setAutoCompaction(enabled);
      if (generation !== operationGeneration) return;
      syncSnapshotMetadata(snapshot);
      set({ session: snapshot.session, mutation: null });
    } catch (reason) {
      if (generation === operationGeneration) set({ session: previousSession, mutation: null, error: errorMessage(reason) });
    }
  },

  setAutoRetry: async (enabled) => {
    const previousSession = get().session;
    if (previousSession?.autoRetryEnabled === enabled) return;
    const generation = ++operationGeneration;
    set({
      mutation: "queue-policy",
      error: null,
      session: previousSession ? { ...previousSession, autoRetryEnabled: enabled } : previousSession,
    });
    try {
      const snapshot = await agentGateway.setAutoRetry(enabled);
      if (generation !== operationGeneration) return;
      syncSnapshotMetadata(snapshot);
      set({ session: snapshot.session, mutation: null });
    } catch (reason) {
      if (generation === operationGeneration) set({ session: previousSession, mutation: null, error: errorMessage(reason) });
    }
  },

  selectModel: async (provider, modelId) => {
    const current = get();
    const previousSession = current.session;
    if (previousSession?.model?.provider === provider && previousSession.model.id === modelId) return;
    const selectedModel = current.models.find((model) => model.provider === provider && model.id === modelId);
    if (!selectedModel) {
      set({ error: "所选模型不在当前可用模型列表中" });
      return;
    }
    const generation = ++operationGeneration;
    set({
      mutation: "model",
      error: null,
    });
    try {
      const snapshot = await agentGateway.setModel(provider, modelId);
      if (generation !== operationGeneration) return;
      syncSnapshotMetadata(snapshot);
      if (snapshot.session.model) {
        useSettingsStore.getState().setPreferredModel(snapshot.session.model.provider, snapshot.session.model.id);
      }
      useSettingsStore.getState().setPreferredThinkingLevel(snapshot.session.thinkingLevel);
      set({ session: snapshot.session, models: snapshot.models, thinkingLevels: snapshot.thinkingLevels, mutation: null });
    } catch (reason) {
      if (generation === operationGeneration) set({ session: previousSession, mutation: null, error: errorMessage(reason) });
    }
  },

  selectThinkingLevel: async (level) => {
    const previousSession = get().session;
    if (previousSession?.thinkingLevel === level) return;
    const generation = ++operationGeneration;
    set({
      mutation: "thinking",
      error: null,
      session: previousSession ? { ...previousSession, thinkingLevel: level } : previousSession,
    });
    try {
      const snapshot = await agentGateway.setThinkingLevel(level);
      if (generation !== operationGeneration) return;
      syncSnapshotMetadata(snapshot);
      useSettingsStore.getState().setPreferredThinkingLevel(snapshot.session.thinkingLevel);
      set({ session: snapshot.session, thinkingLevels: snapshot.thinkingLevels, mutation: null });
    } catch (reason) {
      if (generation === operationGeneration) set({ session: previousSession, mutation: null, error: errorMessage(reason) });
    }
  },

  refreshSessionState: async () => {
    if (get().mutation !== null || !get().session) return;
    try {
      const configuration = await agentGateway.getSessionConfiguration();
      if (get().session?.id === configuration.session.id) {
        const thinkingLevels = normalizeThinkingLevels(
          configuration.thinkingLevels,
          configuration.session.thinkingLevel,
        );
        if (configuration.session.model) {
          useSettingsStore.getState().setPreferredModel(
            configuration.session.model.provider,
            configuration.session.model.id,
          );
        }
        useSettingsStore.getState().setPreferredThinkingLevel(configuration.session.thinkingLevel);
        set({ session: configuration.session, thinkingLevels });
      }
    } catch {
      // A settled event can race with process shutdown or a session switch.
    }
  },

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
      pendingSessionId: null,
      error: null,
    });
  },
}));
