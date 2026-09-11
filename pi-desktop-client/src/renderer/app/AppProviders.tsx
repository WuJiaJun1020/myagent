import { MotionConfig } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { TooltipProvider } from "../components/ui/tooltip";
import { useSettingsStore, type ResolvedTheme } from "../stores/settings-store";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  const theme = useSettingsStore((state) => state.theme);
  const animationEnabled = useSettingsStore((state) => state.animationEnabled);
  const setResolvedTheme = useSettingsStore((state) => state.setResolvedTheme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = (): void => {
      const resolved: ResolvedTheme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      setResolvedTheme(resolved);
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [setResolvedTheme, theme]);

  return (
    <MotionConfig reducedMotion={animationEnabled ? "user" : "always"}>
      <TooltipProvider delayDuration={350}>{children}</TooltipProvider>
    </MotionConfig>
  );
}
