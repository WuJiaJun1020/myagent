import { create } from "zustand";
import type {
  ProviderAuthProgressEvent,
  ProviderAuthRequest,
  ProviderAuthType,
  ProviderAuthUiEvent,
  ProviderSnapshot,
} from "../../shared/contracts/provider-auth";
import { agentGateway } from "../services/agent-gateway";
import { useAgentStore } from "./agent-store";
import { useSessionStore } from "./session-store";

type ActiveProviderFlow = {
  id: string;
  providerId: string;
  method: ProviderAuthType;
};

type ProviderStore = {
  providers: ProviderSnapshot["providers"];
  updatedAt: number;
  runtimeError?: string;
  loading: boolean;
  activeFlow: ActiveProviderFlow | null;
  prompt: ProviderAuthRequest | null;
  notices: ProviderAuthProgressEvent["event"][];
  error: string | null;
  initialize: () => Promise<void>;
  login: (providerId: string, method: ProviderAuthType) => Promise<void>;
  logout: (providerId: string) => Promise<void>;
  cancelLogin: () => Promise<void>;
  answerPrompt: (value?: string, cancelled?: boolean) => Promise<void>;
  handleEvent: (event: ProviderAuthUiEvent) => void;
  clearError: () => void;
  reset: () => void;
};

const emptySnapshot: ProviderSnapshot = { providers: [], updatedAt: 0 };
let generation = 0;

function snapshotState(snapshot: ProviderSnapshot): Pick<ProviderStore, "providers" | "updatedAt" | "runtimeError"> {
  return { providers: snapshot.providers, updatedAt: snapshot.updatedAt, runtimeError: snapshot.error };
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

async function refreshSessionModels(): Promise<void> {
  const cwd = useAgentStore.getState().processStatus.cwd;
  if (cwd) await useSessionStore.getState().initialize(cwd);
}

export const useProviderStore = create<ProviderStore>((set, get) => ({
  ...emptySnapshot,
  runtimeError: undefined,
  loading: false,
  activeFlow: null,
  prompt: null,
  notices: [],
  error: null,

  initialize: async () => {
    const currentGeneration = ++generation;
    set({ loading: true, error: null });
    try {
      const snapshot = await agentGateway.getProviders();
      if (currentGeneration === generation) set({ ...snapshotState(snapshot), loading: false });
    } catch (reason) {
      if (currentGeneration === generation) set({ loading: false, error: message(reason) });
    }
  },

  login: async (providerId, method) => {
    if (get().activeFlow) return;
    const flowId = crypto.randomUUID();
    const currentGeneration = ++generation;
    set({ activeFlow: { id: flowId, providerId, method }, prompt: null, notices: [], error: null });
    try {
      const snapshot = await agentGateway.loginProvider(providerId, method, flowId);
      if (currentGeneration !== generation) return;
      set({ ...snapshotState(snapshot), activeFlow: null, prompt: null });
      await refreshSessionModels();
    } catch (reason) {
      if (currentGeneration === generation) {
        set({ activeFlow: null, prompt: null, error: message(reason) });
      }
    }
  },

  logout: async (providerId) => {
    if (get().activeFlow) return;
    const currentGeneration = ++generation;
    set({ loading: true, error: null });
    try {
      const snapshot = await agentGateway.logoutProvider(providerId);
      if (currentGeneration !== generation) return;
      set({ ...snapshotState(snapshot), loading: false });
      await refreshSessionModels();
    } catch (reason) {
      if (currentGeneration === generation) set({ loading: false, error: message(reason) });
    }
  },

  cancelLogin: async () => {
    const flow = get().activeFlow;
    if (!flow) return;
    try {
      await agentGateway.cancelProviderLogin(flow.id);
    } catch (reason) {
      set({ error: message(reason) });
    } finally {
      ++generation;
      set({ activeFlow: null, prompt: null });
    }
  },

  answerPrompt: async (value, cancelled = false) => {
    const prompt = get().prompt;
    if (!prompt) return;
    try {
      await agentGateway.respondToProviderAuth({
        type: "provider_auth_response",
        flowId: prompt.flowId,
        id: prompt.id,
        ...(cancelled ? { cancelled: true } : { value: value ?? "" }),
      });
      set({ prompt: null });
    } catch (reason) {
      set({ error: message(reason) });
    }
  },

  handleEvent: (event) => {
    const flow = get().activeFlow;
    if (!flow || flow.id !== event.flowId) return;
    if (event.type === "provider_auth_request") {
      set({ prompt: event });
      return;
    }
    set((state) => ({ notices: [...state.notices, event.event].slice(-12) }));
    if (event.event.type === "auth_url") {
      void agentGateway.openExternal(event.event.url).catch((reason: unknown) => set({ error: message(reason) }));
    }
    if (event.event.type === "device_code") {
      void agentGateway.openExternal(event.event.verificationUri).catch((reason: unknown) => set({ error: message(reason) }));
    }
    if (event.event.type === "failed") set({ error: event.event.message });
  },

  clearError: () => set({ error: null }),
  reset: () => {
    ++generation;
    set({ ...emptySnapshot, runtimeError: undefined, loading: false, activeFlow: null, prompt: null, notices: [], error: null });
  },
}));
