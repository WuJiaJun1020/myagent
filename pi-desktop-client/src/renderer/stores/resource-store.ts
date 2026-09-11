import { create } from "zustand";
import type {
  McpServerSummary,
  MemoryResource,
  RuntimeResourceIssue,
  RuntimeToolSummary,
} from "../../shared/contracts/runtime-resources";
import { agentGateway } from "../services/agent-gateway";

type ResourceStore = {
  nativeMcp: boolean;
  semanticMemory: boolean;
  tools: RuntimeToolSummary[];
  mcpServers: McpServerSummary[];
  memories: MemoryResource[];
  issues: RuntimeResourceIssue[];
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  workspace: string;
  initialize: (cwd: string) => Promise<void>;
  reset: () => void;
  clearError: () => void;
};

let resourceGeneration = 0;

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

const emptyResourceState = {
  nativeMcp: false,
  semanticMemory: false,
  tools: [] as RuntimeToolSummary[],
  mcpServers: [] as McpServerSummary[],
  memories: [] as MemoryResource[],
  issues: [] as RuntimeResourceIssue[],
  loading: false,
  error: null,
  updatedAt: null,
  workspace: "",
};

export const useResourceStore = create<ResourceStore>((set) => ({
  ...emptyResourceState,
  initialize: async (cwd) => {
    if (!cwd) return;
    const generation = ++resourceGeneration;
    set((state) => ({
      ...(state.workspace && state.workspace !== cwd ? emptyResourceState : {}),
      loading: true,
      error: null,
      workspace: cwd,
    }));
    try {
      const snapshot = await agentGateway.getRuntimeResources();
      if (generation !== resourceGeneration) return;
      set({
        nativeMcp: snapshot.capabilities.nativeMcp,
        semanticMemory: snapshot.capabilities.semanticMemory,
        tools: snapshot.tools,
        mcpServers: snapshot.mcpServers,
        memories: snapshot.memories,
        issues: snapshot.issues,
        loading: false,
        error: null,
        updatedAt: snapshot.updatedAt,
        workspace: cwd,
      });
    } catch (reason) {
      if (generation === resourceGeneration) set({ loading: false, error: errorMessage(reason), workspace: cwd });
    }
  },
  reset: () => {
    resourceGeneration += 1;
    set(emptyResourceState);
  },
  clearError: () => set({ error: null }),
}));
