import { applyWorkspaceAppearance } from "../lib/workspace-theme";
import { MotionConfig } from "framer-motion";
import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { TooltipProvider } from "../components/ui/tooltip";
import { applyTypographySettings } from "../lib/typography";
import { useSettingsStore, type ResolvedTheme } from "../stores/settings-store";
import { useUiStore } from "../stores/ui-store";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  const activeModule = useUiStore((state) => state.activeModule);
  useLayoutEffect(() => {
    document.documentElement.dataset.workspace = activeModule;
  }, [activeModule]);
  const palette = useSettingsStore((state) => state.palette);
  const accent = useSettingsStore((state) => state.accent);
  const theme = useSettingsStore((state) => state.theme);
  const animationEnabled = useSettingsStore((state) => state.animationEnabled);
  const uiFontFamily = useSettingsStore((state) => state.uiFontFamily);
  const contentFontFamily = useSettingsStore((state) => state.contentFontFamily);
  const codeFontFamily = useSettingsStore((state) => state.codeFontFamily);
  const uiFontSize = useSettingsStore((state) => state.uiFontSize);
  const contentFontSize = useSettingsStore((state) => state.contentFontSize);
  const codeFontSize = useSettingsStore((state) => state.codeFontSize);
  const setResolvedTheme = useSettingsStore((state) => state.setResolvedTheme);

  useEffect(() => {
    // Close the top-layer select picker before Escape reaches a surrounding dialog.
    const dismissPickerFirst = (event: KeyboardEvent) => {
      if (event.key === "Escape" && document.querySelector("select:open")) {
        event.stopPropagation();
      }
    };
    document.addEventListener("keydown", dismissPickerFirst, true);
    return () => document.removeEventListener("keydown", dismissPickerFirst, true);
  }, []);

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = (): void => {
      const resolved: ResolvedTheme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      applyWorkspaceAppearance(document.documentElement, palette, accent, resolved, animationEnabled);
      setResolvedTheme(resolved);
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [setResolvedTheme, theme, palette, accent, animationEnabled]);

  useEffect(() => {
    applyTypographySettings({
      uiFontFamily,
      contentFontFamily,
      codeFontFamily,
      uiFontSize,
      contentFontSize,
      codeFontSize,
    });
  }, [codeFontFamily, codeFontSize, contentFontFamily, contentFontSize, uiFontFamily, uiFontSize]);

  return (
    <MotionConfig reducedMotion={animationEnabled ? "user" : "always"}>
      <TooltipProvider delayDuration={350}>{children}</TooltipProvider>
    </MotionConfig>
  );
}
