import type { AgentEvent, InteractionRequest } from "../../shared/contracts/agent-events";
import type {
  AgentRuntimeSnapshot,
  AgentSessionState,
  ApprovalPolicy,
  SessionMode,
  ThinkingLevel,
} from "../../shared/contracts/agent-session";
import type { RuntimeResourceSnapshot } from "../../shared/contracts/runtime-resources";
import type {
  ProviderAuthResponse,
  ProviderAuthType,
  ProviderAuthUiEvent,
  ProviderSnapshot,
} from "../../shared/contracts/provider-auth";
import type { ExtensionUiResponse, ProcessStatus } from "../../shared/rpc";

export interface AgentGateway {
  getStatus(): Promise<ProcessStatus>;
  selectWorkspace(): Promise<ProcessStatus>;
  restart(): Promise<ProcessStatus>;
  getRuntimeSnapshot(): Promise<AgentRuntimeSnapshot>;
  getSessionState(): Promise<AgentSessionState>;
  newSession(mode: SessionMode): Promise<AgentRuntimeSnapshot>;
  switchSession(sessionId: string): Promise<AgentRuntimeSnapshot>;
  renameSession(sessionId: string, name: string): Promise<AgentRuntimeSnapshot>;
  deleteSession(sessionId: string): Promise<AgentRuntimeSnapshot>;
  setSessionMode(mode: SessionMode): Promise<AgentRuntimeSnapshot>;
  setApprovalPolicy(policy: ApprovalPolicy): Promise<AgentRuntimeSnapshot>;
  setModel(provider: string, modelId: string): Promise<AgentRuntimeSnapshot>;
  setThinkingLevel(level: ThinkingLevel): Promise<AgentRuntimeSnapshot>;
  getRuntimeResources(): Promise<RuntimeResourceSnapshot>;
  getProviders(): Promise<ProviderSnapshot>;
  loginProvider(providerId: string, method: ProviderAuthType, flowId: string): Promise<ProviderSnapshot>;
  logoutProvider(providerId: string): Promise<ProviderSnapshot>;
  cancelProviderLogin(flowId: string): Promise<void>;
  respondToProviderAuth(response: ProviderAuthResponse): Promise<void>;
  openExternal(url: string): Promise<void>;
  sendPrompt(message: string, followUp: boolean): Promise<void>;
  compact(customInstructions?: string): Promise<void>;
  abort(): Promise<void>;
  respondToInteraction(request: InteractionRequest, response: Omit<ExtensionUiResponse, "type" | "id">): Promise<void>;
  subscribe(listener: (event: AgentEvent) => void): () => void;
  subscribeStatus(listener: (status: ProcessStatus) => void): () => void;
  subscribeProviderAuth(listener: (event: ProviderAuthUiEvent) => void): () => void;
}

class DesktopAgentGateway implements AgentGateway {
  getStatus(): Promise<ProcessStatus> {
    return window.piDesktop.getStatus();
  }

  selectWorkspace(): Promise<ProcessStatus> {
    return window.piDesktop.selectWorkspace();
  }

  restart(): Promise<ProcessStatus> {
    return window.piDesktop.restart();
  }

  getRuntimeSnapshot(): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.getRuntimeSnapshot();
  }

  getSessionState(): Promise<AgentSessionState> {
    return window.piDesktop.getSessionState();
  }

  newSession(mode: SessionMode): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.newSession(mode);
  }

  switchSession(sessionId: string): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.switchSession(sessionId);
  }

  renameSession(sessionId: string, name: string): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.renameSession(sessionId, name);
  }

  deleteSession(sessionId: string): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.deleteSession(sessionId);
  }

  setSessionMode(mode: SessionMode): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.setSessionMode(mode);
  }

  setApprovalPolicy(policy: ApprovalPolicy): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.setApprovalPolicy(policy);
  }

  setModel(provider: string, modelId: string): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.setModel(provider, modelId);
  }

  setThinkingLevel(level: ThinkingLevel): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.setThinkingLevel(level);
  }

  getRuntimeResources(): Promise<RuntimeResourceSnapshot> {
    return window.piDesktop.getRuntimeResources();
  }

  getProviders(): Promise<ProviderSnapshot> {
    return window.piDesktop.getProviders();
  }

  loginProvider(providerId: string, method: ProviderAuthType, flowId: string): Promise<ProviderSnapshot> {
    return window.piDesktop.loginProvider(providerId, method, flowId);
  }

  logoutProvider(providerId: string): Promise<ProviderSnapshot> {
    return window.piDesktop.logoutProvider(providerId);
  }

  cancelProviderLogin(flowId: string): Promise<void> {
    return window.piDesktop.cancelProviderLogin(flowId);
  }

  respondToProviderAuth(response: ProviderAuthResponse): Promise<void> {
    return window.piDesktop.respondToProviderAuth(response);
  }

  openExternal(url: string): Promise<void> {
    return window.piDesktop.openExternal(url);
  }

  async sendPrompt(message: string, followUp: boolean): Promise<void> {
    await window.piDesktop.send({ type: followUp ? "follow_up" : "prompt", message });
  }

  async compact(customInstructions?: string): Promise<void> {
    await window.piDesktop.send({ type: "compact", customInstructions });
  }

  async abort(): Promise<void> {
    await window.piDesktop.send({ type: "abort" });
  }

  respondToInteraction(
    request: InteractionRequest,
    response: Omit<ExtensionUiResponse, "type" | "id">,
  ): Promise<void> {
    return window.piDesktop.respondToExtension({
      type: "extension_ui_response",
      id: request.id,
      ...response,
    });
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    return window.piDesktop.onAgentEvent(listener);
  }

  subscribeStatus(listener: (status: ProcessStatus) => void): () => void {
    return window.piDesktop.onStatus(listener);
  }

  subscribeProviderAuth(listener: (event: ProviderAuthUiEvent) => void): () => void {
    return window.piDesktop.onProviderAuthEvent(listener);
  }
}

export const agentGateway: AgentGateway = new DesktopAgentGateway();
