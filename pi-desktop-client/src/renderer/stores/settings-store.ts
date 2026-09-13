import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ThinkingLevel } from "../../shared/contracts/agent-session";
import {
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_CONTENT_FONT_SIZE,
  DEFAULT_UI_FONT_SIZE,
  type CodeFontFamily,
  type ContentFontFamily,
  type UiFontFamily,
} from "../lib/typography";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

type SettingsStore = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  animationEnabled: boolean;
  uiFontFamily: UiFontFamily;
  contentFontFamily: ContentFontFamily;
  codeFontFamily: CodeFontFamily;
  uiFontSize: number;
  contentFontSize: number;
  codeFontSize: number;
  preferredModel: { provider: string; id: string } | null;
  preferredThinkingLevel: ThinkingLevel;
  lastSessionByWorkspace: Record<string, string>;
  sidebarWidth: number;
  detailPanelWidth: number;
  setTheme: (theme: ThemePreference) => void;
  setResolvedTheme: (theme: ResolvedTheme) => void;
  setAnimationEnabled: (enabled: boolean) => void;
  setUiFontFamily: (font: UiFontFamily) => void;
  setContentFontFamily: (font: ContentFontFamily) => void;
  setCodeFontFamily: (font: CodeFontFamily) => void;
  setUiFontSize: (size: number) => void;
  setContentFontSize: (size: number) => void;
  setCodeFontSize: (size: number) => void;
  resetTypography: () => void;
  setPreferredModel: (provider: string, id: string) => void;
  setPreferredThinkingLevel: (level: ThinkingLevel) => void;
  rememberSession: (cwd: string, sessionId: string) => void;
  setSidebarWidth: (width: number) => void;
  setDetailPanelWidth: (width: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function initialResolvedTheme(): ResolvedTheme {
  if (typeof document !== "undefined") {
    const bootstrappedTheme = document.documentElement.dataset.theme;
    if (bootstrappedTheme === "light" || bootstrappedTheme === "dark") return bootstrappedTheme;
  }
  return "dark";
}

export const useSettingsStore = create<SettingsStore>()(persist(
  (set) => ({
    theme: "dark",
    resolvedTheme: initialResolvedTheme(),
    animationEnabled: true,
    uiFontFamily: "system",
    contentFontFamily: "ui",
    codeFontFamily: "consolas",
    uiFontSize: DEFAULT_UI_FONT_SIZE,
    contentFontSize: DEFAULT_CONTENT_FONT_SIZE,
    codeFontSize: DEFAULT_CODE_FONT_SIZE,
    preferredModel: null,
    preferredThinkingLevel: "medium",
    lastSessionByWorkspace: {},
    sidebarWidth: 236,
    detailPanelWidth: 310,
    setTheme: (theme) => set({ theme }),
    setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),
    setAnimationEnabled: (animationEnabled) => set({ animationEnabled }),
    setUiFontFamily: (uiFontFamily) => set({ uiFontFamily }),
    setContentFontFamily: (contentFontFamily) => set({ contentFontFamily }),
    setCodeFontFamily: (codeFontFamily) => set({ codeFontFamily }),
    setUiFontSize: (uiFontSize) => set({ uiFontSize: clamp(uiFontSize, 11, 17) }),
    setContentFontSize: (contentFontSize) => set({ contentFontSize: clamp(contentFontSize, 12, 20) }),
    setCodeFontSize: (codeFontSize) => set({ codeFontSize: clamp(codeFontSize, 10, 18) }),
    resetTypography: () => set({
      uiFontFamily: "system",
      contentFontFamily: "ui",
      codeFontFamily: "consolas",
      uiFontSize: DEFAULT_UI_FONT_SIZE,
      contentFontSize: DEFAULT_CONTENT_FONT_SIZE,
      codeFontSize: DEFAULT_CODE_FONT_SIZE,
    }),
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
      uiFontFamily: state.uiFontFamily,
      contentFontFamily: state.contentFontFamily,
      codeFontFamily: state.codeFontFamily,
      uiFontSize: state.uiFontSize,
      contentFontSize: state.contentFontSize,
      codeFontSize: state.codeFontSize,
      preferredModel: state.preferredModel,
      preferredThinkingLevel: state.preferredThinkingLevel,
      lastSessionByWorkspace: state.lastSessionByWorkspace,
      sidebarWidth: state.sidebarWidth,
      detailPanelWidth: state.detailPanelWidth,
    }),
  },
));
