import { create } from "zustand";
import type { ImageAttachment } from "../../shared/contracts/agent-session";

export type SidebarView = "activity" | "files" | "mcp" | "memory";
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
  sidebarView: SidebarView;
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
  setSidebarView: (view: SidebarView) => void;
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

function isSidebarView(value: unknown): value is SidebarView {
  return value === "activity" || value === "files" || value === "mcp" || value === "memory";
}

function isResourceCenterTab(value: unknown): value is ResourceCenterTab {
  return value === "online" || value === "packages" || value === "skills"
    || value === "extensions" || value === "prompts" || value === "tools";
}

function readNavigation(): { sidebarView: SidebarView; resourceCenterTab: ResourceCenterTab } {
  const fallback = { sidebarView: "activity" as const, resourceCenterTab: "online" as const };
  if (typeof sessionStorage === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(NAVIGATION_STORAGE_KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw) as { sidebarView?: unknown; resourceCenterTab?: unknown };
    return {
      sidebarView: isSidebarView(value.sidebarView) ? value.sidebarView : fallback.sidebarView,
      resourceCenterTab: isResourceCenterTab(value.resourceCenterTab) ? value.resourceCenterTab : fallback.resourceCenterTab,
    };
  } catch {
    return fallback;
  }
}

function saveNavigation(sidebarView: SidebarView, resourceCenterTab: ResourceCenterTab): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify({ sidebarView, resourceCenterTab }));
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
  sidebarView: initialNavigation.sidebarView,
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
  setSidebarView: (sidebarView) => set((state) => {
    saveNavigation(sidebarView, state.resourceCenterTab);
    return { sidebarView };
  }),
  setResourceCenterTab: (resourceCenterTab) => set((state) => {
    saveNavigation(state.sidebarView, resourceCenterTab);
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
