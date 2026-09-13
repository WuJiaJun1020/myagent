import { create } from "zustand";
import type {
  McpServerSummary,
  MemoryResource,
  RuntimeResourceIssue,
  RuntimeCommandResource,
  RuntimeExtensionSummary,
  RuntimeManagedResource,
  RuntimePackageSummary,
  RuntimeResourceMutation,
  RuntimeToolSummary,
} from "../../shared/contracts/runtime-resources";
import { agentGateway } from "../services/agent-gateway";

type ResourceStore = {
  nativeMcp: boolean;
  semanticMemory: boolean;
  tools: RuntimeToolSummary[];
  mcpServers: McpServerSummary[];
  memories: MemoryResource[];
  commandResources: RuntimeCommandResource[];
  extensions: RuntimeExtensionSummary[];
  packages: RuntimePackageSummary[];
  managedResources: RuntimeManagedResource[];
  projectTrusted: boolean;
  issues: RuntimeResourceIssue[];
  loading: boolean;
  mutation: string | null;
  error: string | null;
  updatedAt: number | null;
  workspace: string;
  initialize: (cwd: string) => Promise<void>;
  reload: (cwd: string) => Promise<void>;
  mutate: (cwd: string, mutation: RuntimeResourceMutation) => Promise<void>;
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
  commandResources: [] as RuntimeCommandResource[],
  extensions: [] as RuntimeExtensionSummary[],
  packages: [] as RuntimePackageSummary[],
  managedResources: [] as RuntimeManagedResource[],
  projectTrusted: false,
  issues: [] as RuntimeResourceIssue[],
  loading: false,
  mutation: null,
  error: null,
  updatedAt: null,
  workspace: "",
};

export const useResourceStore = create<ResourceStore>((set, get) => ({
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
        commandResources: snapshot.commandResources,
        extensions: snapshot.extensions,
        packages: snapshot.packages,
        managedResources: snapshot.managedResources,
        projectTrusted: snapshot.projectTrusted,
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
  reload: async (cwd) => {
    if (!cwd) return;
    const generation = ++resourceGeneration;
    set({ loading: true, error: null, workspace: cwd });
    try {
      const snapshot = await agentGateway.reloadRuntimeResources();
      if (generation !== resourceGeneration) return;
      set({
        nativeMcp: snapshot.capabilities.nativeMcp,
        semanticMemory: snapshot.capabilities.semanticMemory,
        tools: snapshot.tools,
        mcpServers: snapshot.mcpServers,
        memories: snapshot.memories,
        commandResources: snapshot.commandResources,
        extensions: snapshot.extensions,
        packages: snapshot.packages,
        managedResources: snapshot.managedResources,
        projectTrusted: snapshot.projectTrusted,
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
  mutate: async (cwd, mutation) => {
    if (!cwd) return;
    const generation = ++resourceGeneration;
    const previousManagedResources = get().managedResources;
    const mutationLabel = mutation.type === "set-enabled"
      ? `${mutation.enabled ? "启用" : "停用"} ${mutation.path}`
      : `${mutation.type} ${mutation.source}`;
    set((state) => ({
      mutation: mutationLabel,
      error: null,
      workspace: cwd,
      managedResources: mutation.type === "set-enabled"
        ? state.managedResources.map((resource) => (
            resource.path === mutation.path
            && resource.sourceId === mutation.source
            && resource.source.scope === mutation.scope
              ? { ...resource, enabled: mutation.enabled }
              : resource
          ))
        : state.managedResources,
    }));
    try {
      const snapshot = await agentGateway.mutateRuntimeResources(mutation);
      if (generation !== resourceGeneration) {
        set((state) => state.mutation === mutationLabel ? { mutation: null } : {});
        return;
      }
      set({
        nativeMcp: snapshot.capabilities.nativeMcp,
        semanticMemory: snapshot.capabilities.semanticMemory,
        tools: snapshot.tools,
        mcpServers: snapshot.mcpServers,
        memories: snapshot.memories,
        commandResources: snapshot.commandResources,
        extensions: snapshot.extensions,
        packages: snapshot.packages,
        managedResources: snapshot.managedResources,
        projectTrusted: snapshot.projectTrusted,
        issues: snapshot.issues,
        loading: false,
        mutation: null,
        error: null,
        updatedAt: snapshot.updatedAt,
        workspace: cwd,
      });
    } catch (reason) {
      if (generation === resourceGeneration) {
        set({
          managedResources: previousManagedResources,
          mutation: null,
          error: errorMessage(reason),
          workspace: cwd,
        });
      }
      else set((state) => state.mutation === mutationLabel ? { mutation: null } : {});
      throw reason;
    }
  },
  reset: () => {
    resourceGeneration += 1;
    set(emptyResourceState);
  },
  clearError: () => set({ error: null }),
}));
