import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ThinkingLevel } from "../../shared/contracts/agent-session";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

type SettingsStore = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  animationEnabled: boolean;
  preferredModel: { provider: string; id: string } | null;
  preferredThinkingLevel: ThinkingLevel;
  lastSessionByWorkspace: Record<string, string>;
  sidebarWidth: number;
  detailPanelWidth: number;
  setTheme: (theme: ThemePreference) => void;
  setResolvedTheme: (theme: ResolvedTheme) => void;
  setAnimationEnabled: (enabled: boolean) => void;
  setPreferredModel: (provider: string, id: string) => void;
  setPreferredThinkingLevel: (level: ThinkingLevel) => void;
  rememberSession: (cwd: string, sessionId: string) => void;
  setSidebarWidth: (width: number) => void;
  setDetailPanelWidth: (width: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export const useSettingsStore = create<SettingsStore>()(persist(
  (set) => ({
    theme: "dark",
    resolvedTheme: "dark",
    animationEnabled: true,
    preferredModel: null,
    preferredThinkingLevel: "medium",
    lastSessionByWorkspace: {},
    sidebarWidth: 236,
    detailPanelWidth: 310,
    setTheme: (theme) => set({ theme }),
    setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),
    setAnimationEnabled: (animationEnabled) => set({ animationEnabled }),
    setPreferredModel: (provider, id) => set({ preferredModel: { provider, id } }),
    setPreferredThinkingLevel: (preferredThinkingLevel) => set({ preferredThinkingLevel }),
    rememberSession: (cwd, sessionId) => set((state) => ({
      lastSessionByWorkspace: { ...state.lastSessionByWorkspace, [cwd]: sessionId },
    })),
    setSidebarWidth: (sidebarWidth) => set({ sidebarWidth: clamp(sidebarWidth, 196, 360) }),
    setDetailPanelWidth: (detailPanelWidth) => set({ detailPanelWidth: clamp(detailPanelWidth, 260, 520) }),
  }),
  {
    name: "pi-desktop-settings",
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
      theme: state.theme,
      animationEnabled: state.animationEnabled,
      preferredModel: state.preferredModel,
      preferredThinkingLevel: state.preferredThinkingLevel,
      lastSessionByWorkspace: state.lastSessionByWorkspace,
      sidebarWidth: state.sidebarWidth,
      detailPanelWidth: state.detailPanelWidth,
    }),
  },
));
