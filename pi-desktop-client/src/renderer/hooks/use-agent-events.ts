import { useEffect } from "react";
import type { ProcessStatus } from "../../shared/rpc";
import { agentGateway } from "../services/agent-gateway";
import { useAgentStore } from "../stores/agent-store";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useSessionStore } from "../stores/session-store";
import { useResourceStore } from "../stores/resource-store";
import { useProviderStore } from "../stores/provider-store";

function applyProcessStatus(status: ProcessStatus): void {
  const previous = useAgentStore.getState().processStatus;
  const sessionTransition = useSessionStore.getState().mutation === "session";
  if (previous.cwd !== status.cwd) {
    useAgentStore.getState().resetSession();
    if (sessionTransition) useSessionStore.getState().prepareWorkspaceTransition();
    else useSessionStore.getState().reset();
    useResourceStore.getState().reset();
    useProviderStore.getState().reset();
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
