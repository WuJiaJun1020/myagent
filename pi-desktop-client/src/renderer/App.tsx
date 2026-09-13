import { useEffect, useRef } from "react";
import { WorkspaceApplication } from "./app/WorkspaceApplication";
import { useAgentEvents } from "./hooks/use-agent-events";

export function App() {
  useAgentEvents();
  const rendererReadySent = useRef(false);

  useEffect(() => {
    if (rendererReadySent.current) return;
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        rendererReadySent.current = true;
        const appliedTheme = document.documentElement.dataset.theme;
        window.piDesktop.rendererReady(appliedTheme === "light" ? "light" : "dark");
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  return <WorkspaceApplication />;
}
