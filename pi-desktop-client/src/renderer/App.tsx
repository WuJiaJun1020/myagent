import { useEffect, useRef } from "react";
import { WorkspaceApplication } from "./app/WorkspaceApplication";
import { useAgentEvents } from "./hooks/use-agent-events";
import { useExtensionShortcuts } from "./hooks/use-extension-shortcuts";
import { getRendererModule } from "./modules/renderer-module-registry";
import { useUiStore } from "./stores/ui-store";

export function App() {
  useAgentEvents();
  useExtensionShortcuts();
  const rendererReadySent = useRef(false);

  useEffect(() => {
    if (rendererReadySent.current) return;
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    const revealWhenReady = async (): Promise<void> => {
      try {
        await getRendererModule(useUiStore.getState().activeModule).preload?.();
      } catch {
        // The module error boundary becomes the visible recovery UI.
      }
      if (cancelled) return;
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          rendererReadySent.current = true;
          const appliedTheme = document.documentElement.dataset.theme;
          window.piDesktop.rendererReady(appliedTheme === "light" ? "light" : "dark");
        });
      });
    };
    void revealWhenReady();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  return <WorkspaceApplication />;
}
