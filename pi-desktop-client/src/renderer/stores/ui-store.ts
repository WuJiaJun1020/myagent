import { create } from "zustand";
import type { ImageAttachment } from "../../shared/contracts/agent-session";
import { isProductModuleId, type ProductModuleId } from "../../platform/shared/product-module";
import type { AgentView, InterviewView, KnowledgeStudioView, ModuleViews } from "../modules/module-navigation";

export type ResourceCenterTab = "online" | "packages" | "skills" | "extensions" | "prompts" | "tools";
export type DetailSelection =
  | { type: "tool"; id: string }
  | { type: "file"; path: string };

export type SessionComposerDraft = {
  text: string;
  attachments: ImageAttachment[];
};

export type SessionChatScroll = {
  scrollTop: number;
  pinned: boolean;
  anchorId?: string;
  anchorOffset?: number;
};

type UiStore = {
  sidebarOpen: boolean;
  detailPanelOpen: boolean;
  settingsOpen: boolean;
  providerSettingsOpen: boolean;
  sessionOverviewOpen: boolean;
  terminalPanelOpen: boolean;
  activeModule: ProductModuleId;
  moduleViews: ModuleViews;
  resourceCenterTab: ResourceCenterTab;
  detailSelection: DetailSelection | null;
  composerDraft: string | null;
  sessionComposerDrafts: Record<string, SessionComposerDraft>;
  sessionChatScroll: Record<string, SessionChatScroll>;
  chatFollowRequest: number;
  toggleSidebar: () => void;
  toggleDetailPanel: () => void;
  setSettingsOpen: (open: boolean) => void;
  setProviderSettingsOpen: (open: boolean) => void;
  setSessionOverviewOpen: (open: boolean) => void;
  toggleTerminalPanel: () => void;
  setActiveModule: (moduleId: ProductModuleId) => void;
  setAgentView: (view: AgentView) => void;
  setInterviewView: (view: InterviewView) => void;
  setKnowledgeStudioView: (view: KnowledgeStudioView) => void;
  setResourceCenterTab: (tab: ResourceCenterTab) => void;
  setComposerDraft: (draft: string | null) => void;
  setSessionComposerDraft: (sessionId: string, draft: SessionComposerDraft) => void;
  setSessionChatScroll: (sessionId: string, scroll: SessionChatScroll) => void;
  removeSessionUiState: (sessionId: string) => void;
  requestChatFollow: () => void;
  selectToolCall: (id: string) => void;
  selectFile: (path: string) => void;
  clearDetailSelection: () => void;
};

const NAVIGATION_STORAGE_KEY = "pi-desktop-current-navigation";

function isAgentView(value: unknown): value is AgentView {
  return value === "activity" || value === "files" || value === "review" || value === "mcp" || value === "memory";
}

function isInterviewView(value: unknown): value is InterviewView {
  return value === "dashboard" || value === "jobs" || value === "question-bank"
    || value === "algorithms" || value === "session";
}

function isKnowledgeStudioView(value: unknown): value is KnowledgeStudioView {
  return value === "studio";
}

function isResourceCenterTab(value: unknown): value is ResourceCenterTab {
  return value === "online" || value === "packages" || value === "skills"
    || value === "extensions" || value === "prompts" || value === "tools";
}

export type PersistedNavigation = {
  activeModule: ProductModuleId;
  moduleViews: ModuleViews;
  resourceCenterTab: ResourceCenterTab;
};

const DEFAULT_NAVIGATION: PersistedNavigation = {
  activeModule: "agent",
  moduleViews: { agent: "activity", interview: "dashboard", "knowledge-studio": "studio" },
  resourceCenterTab: "online",
};

export function parsePersistedNavigation(input: unknown): PersistedNavigation {
  const fallback: PersistedNavigation = {
    activeModule: "agent",
    moduleViews: { agent: "activity", interview: "dashboard", "knowledge-studio": "studio" },
    resourceCenterTab: "online",
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) return fallback;
  const value = input as {
    activeModule?: unknown;
    moduleViews?: unknown;
    sidebarView?: unknown;
    resourceCenterTab?: unknown;
  };
  const storedModuleViews = value.moduleViews && typeof value.moduleViews === "object" && !Array.isArray(value.moduleViews)
    ? value.moduleViews as { agent?: unknown; interview?: unknown; "knowledge-studio"?: unknown }
    : undefined;

  // Migrate the previous single sidebarView value without losing the user's
  // current location. The interview entry represented an entire module,
  // whereas every other value represented an Agent page.
  const legacyView = value.sidebarView;
  const legacyModule = legacyView === "interview" ? "interview" : "agent";
  const legacyAgentView = isAgentView(legacyView) ? legacyView : fallback.moduleViews.agent;
  return {
    activeModule: isProductModuleId(value.activeModule) ? value.activeModule : legacyModule,
    moduleViews: {
      agent: isAgentView(storedModuleViews?.agent) ? storedModuleViews.agent : legacyAgentView,
      interview: isInterviewView(storedModuleViews?.interview) ? storedModuleViews.interview : fallback.moduleViews.interview,
      "knowledge-studio": isKnowledgeStudioView(storedModuleViews?.["knowledge-studio"])
        ? storedModuleViews["knowledge-studio"]
        : fallback.moduleViews["knowledge-studio"],
    },
    resourceCenterTab: isResourceCenterTab(value.resourceCenterTab) ? value.resourceCenterTab : fallback.resourceCenterTab,
  };
}

function readNavigation(): PersistedNavigation {
  const fallback = DEFAULT_NAVIGATION;
  if (typeof sessionStorage === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(NAVIGATION_STORAGE_KEY);
    if (!raw) return fallback;
    return parsePersistedNavigation(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

function saveNavigation(navigation: PersistedNavigation): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(navigation));
  } catch {
    // Navigation persistence is best-effort; the in-memory state still remains correct.
  }
}

const initialNavigation = readNavigation();

export const useUiStore = create<UiStore>((set) => ({
  sidebarOpen: true,
  detailPanelOpen: true,
  settingsOpen: false,
  providerSettingsOpen: false,
  sessionOverviewOpen: false,
  terminalPanelOpen: false,
  activeModule: initialNavigation.activeModule,
  moduleViews: initialNavigation.moduleViews,
  resourceCenterTab: initialNavigation.resourceCenterTab,
  detailSelection: null,
  composerDraft: null,
  sessionComposerDrafts: {},
  sessionChatScroll: {},
  chatFollowRequest: 0,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleDetailPanel: () => set((state) => ({ detailPanelOpen: !state.detailPanelOpen })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setProviderSettingsOpen: (providerSettingsOpen) => set({ providerSettingsOpen }),
  setSessionOverviewOpen: (sessionOverviewOpen) => set({ sessionOverviewOpen }),
  toggleTerminalPanel: () => set((state) => ({ terminalPanelOpen: !state.terminalPanelOpen })),
  setActiveModule: (activeModule) => set((state) => {
    saveNavigation({ activeModule, moduleViews: state.moduleViews, resourceCenterTab: state.resourceCenterTab });
    return { activeModule };
  }),
  setAgentView: (agentView) => set((state) => {
    const moduleViews = { ...state.moduleViews, agent: agentView };
    saveNavigation({ activeModule: state.activeModule, moduleViews, resourceCenterTab: state.resourceCenterTab });
    return agentView === "review" ? { moduleViews, detailPanelOpen: true } : { moduleViews };
  }),
  setInterviewView: (interviewView) => set((state) => {
    const moduleViews = { ...state.moduleViews, interview: interviewView };
    saveNavigation({ activeModule: state.activeModule, moduleViews, resourceCenterTab: state.resourceCenterTab });
    return { moduleViews };
  }),
  setKnowledgeStudioView: (knowledgeStudioView) => set((state) => {
    const moduleViews = { ...state.moduleViews, "knowledge-studio": knowledgeStudioView };
    saveNavigation({ activeModule: state.activeModule, moduleViews, resourceCenterTab: state.resourceCenterTab });
    return { moduleViews };
  }),
  setResourceCenterTab: (resourceCenterTab) => set((state) => {
    saveNavigation({ activeModule: state.activeModule, moduleViews: state.moduleViews, resourceCenterTab });
    return { resourceCenterTab };
  }),
  setComposerDraft: (composerDraft) => set({ composerDraft }),
  setSessionComposerDraft: (sessionId, draft) => set((state) => {
    const sessionComposerDrafts = { ...state.sessionComposerDrafts };
    if (!draft.text && draft.attachments.length === 0) delete sessionComposerDrafts[sessionId];
    else sessionComposerDrafts[sessionId] = draft;
    return { sessionComposerDrafts };
  }),
  setSessionChatScroll: (sessionId, scroll) => set((state) => ({
    sessionChatScroll: { ...state.sessionChatScroll, [sessionId]: scroll },
  })),
  removeSessionUiState: (sessionId) => set((state) => {
    const sessionComposerDrafts = { ...state.sessionComposerDrafts };
    const sessionChatScroll = { ...state.sessionChatScroll };
    delete sessionComposerDrafts[sessionId];
    delete sessionChatScroll[sessionId];
    return { sessionComposerDrafts, sessionChatScroll };
  }),
  requestChatFollow: () => set((state) => ({ chatFollowRequest: state.chatFollowRequest + 1 })),
  selectToolCall: (id) => set({ detailSelection: { type: "tool", id }, detailPanelOpen: true }),
  selectFile: (path) => set({ detailSelection: { type: "file", path }, detailPanelOpen: true }),
  clearDetailSelection: () => set({ detailSelection: null }),
}));
