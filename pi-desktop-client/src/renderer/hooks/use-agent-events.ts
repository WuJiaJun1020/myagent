import { useEffect } from "react";
import type { ProcessStatus } from "../../shared/rpc";
import { agentGateway } from "../services/agent-gateway";
import { useAgentStore } from "../stores/agent-store";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useSessionStore } from "../stores/session-store";
import { useResourceStore } from "../stores/resource-store";
import { useProviderStore } from "../stores/provider-store";
import { usePiSettingsStore } from "../stores/pi-settings-store";
import { useUiStore } from "../stores/ui-store";

export function applyProcessStatus(status: ProcessStatus): void {
  const previous = useAgentStore.getState().processStatus;
  const sessionTransition = useSessionStore.getState().mutation === "session";
  if (previous.cwd !== status.cwd) {
    // During an in-process session switch Pi reports the destination cwd before
    // the destination snapshot is ready. Keep the current presentation intact
    // until switchSession applies that snapshot atomically; clearing here makes
    // the workspace empty state flash between the two updates.
    if (!sessionTransition) {
      useAgentStore.getState().resetSession();
      useSessionStore.getState().reset();
      useResourceStore.getState().reset();
      useProviderStore.getState().reset();
      usePiSettingsStore.getState().reset();
    }
  }
  useAgentStore.getState().setProcessStatus(status);
  useWorkspaceStore.getState().setWorkspace(status.cwd);
  if (!sessionTransition && status.state === "running" && (previous.state !== "running" || previous.cwd !== status.cwd)) {
    void useSessionStore.getState().initialize(status.cwd);
    void useResourceStore.getState().initialize(status.cwd);
    void useProviderStore.getState().initialize();
  }
}

export function useAgentEvents(): void {
  useEffect(() => {
    let active = true;
    const offEvent = agentGateway.subscribe((event) => {
      useAgentStore.getState().applyAgentEvent(event);
      if (event.type === "file.changed") useWorkspaceStore.getState().recordFileChange(event.change);
      if (event.type === "composer.draft") useUiStore.getState().setComposerDraft(event.text);
      if (event.type === "run.settled") {
        const cwd = useAgentStore.getState().processStatus.cwd;
        void useResourceStore.getState().initialize(cwd);
        void useSessionStore.getState().refreshSessionState();
      }
    });
    const offStatus = agentGateway.subscribeStatus((status) => {
      applyProcessStatus(status);
    });
    const offProviderAuth = agentGateway.subscribeProviderAuth((event) => {
      useProviderStore.getState().handleEvent(event);
    });

    void agentGateway.getStatus()
      .then((status) => {
        if (active) {
          applyProcessStatus(status);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          useAgentStore.getState().setError(reason instanceof Error ? reason.message : String(reason));
        }
      });

    return () => {
      active = false;
      offEvent();
      offStatus();
      offProviderAuth();
    };
  }, []);
}
