import { create } from "zustand";

export type SidebarView = "activity" | "files" | "mcp" | "memory";
export type DetailSelection =
  | { type: "tool"; id: string }
  | { type: "file"; path: string };

type UiStore = {
  sidebarOpen: boolean;
  detailPanelOpen: boolean;
  settingsOpen: boolean;
  providerSettingsOpen: boolean;
  sidebarView: SidebarView;
  detailSelection: DetailSelection | null;
  toggleSidebar: () => void;
  toggleDetailPanel: () => void;
  setSettingsOpen: (open: boolean) => void;
  setProviderSettingsOpen: (open: boolean) => void;
  setSidebarView: (view: SidebarView) => void;
  selectToolCall: (id: string) => void;
  selectFile: (path: string) => void;
  clearDetailSelection: () => void;
};

export const useUiStore = create<UiStore>((set) => ({
  sidebarOpen: true,
  detailPanelOpen: true,
  settingsOpen: false,
  providerSettingsOpen: false,
  sidebarView: "activity",
  detailSelection: null,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleDetailPanel: () => set((state) => ({ detailPanelOpen: !state.detailPanelOpen })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setProviderSettingsOpen: (providerSettingsOpen) => set({ providerSettingsOpen }),
  setSidebarView: (sidebarView) => set({ sidebarView }),
  selectToolCall: (id) => set({ detailSelection: { type: "tool", id }, detailPanelOpen: true }),
  selectFile: (path) => set({ detailSelection: { type: "file", path }, detailPanelOpen: true }),
  clearDetailSelection: () => set({ detailSelection: null }),
}));
