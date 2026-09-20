import { useEffect, useMemo } from "react";
import { agentGateway } from "../services/agent-gateway";
import { matchesExtensionShortcut, shouldProtectHostShortcut } from "../lib/extension-shortcuts";
import { useAgentStore } from "../stores/agent-store";
import { useResourceStore } from "../stores/resource-store";

export function useExtensionShortcuts(): void {
  const extensions = useResourceStore((state) => state.extensions);
  const shortcuts = useMemo(() => {
    const resolved = new Map<string, { shortcut: string; description?: string }>();
    for (const extension of extensions) {
      for (const shortcut of extension.shortcuts) resolved.set(shortcut.shortcut.toLowerCase(), shortcut);
    }
    return [...resolved.values()];
  }, [extensions]);

  useEffect(() => {
    if (shortcuts.length === 0) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || shouldProtectHostShortcut(event)) return;
      const shortcut = shortcuts.find((candidate) => matchesExtensionShortcut(event, candidate.shortcut));
      if (!shortcut) return;
      event.preventDefault();
      event.stopPropagation();
      void agentGateway.invokeExtensionShortcut(shortcut.shortcut).catch((reason: unknown) => {
        useAgentStore.getState().setError(reason instanceof Error ? reason.message : String(reason));
      });
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [shortcuts]);
}
