import type { AgentEvent } from "./contracts/agent-events";
import type { AgentRuntimeSnapshot, AgentSessionState, ApprovalPolicy, SessionMode, ThinkingLevel } from "./contracts/agent-session";
import type { RuntimeResourceSnapshot } from "./contracts/runtime-resources";
import type {
  ProviderAuthResponse,
  ProviderAuthType,
  ProviderAuthUiEvent,
  ProviderSnapshot,
} from "./contracts/provider-auth";
import type { WorkspaceDirectoryListing, WorkspaceTextFile } from "./contracts/workspace";

export type RpcCommand = {
  id?: string;
  type: string;
  [key: string]: unknown;
};

export type RpcMessage = {
  id?: string;
  type: string;
  command?: string;
  success?: boolean;
  error?: string;
  [key: string]: unknown;
};

export type ProcessStatus = {
  state: "starting" | "running" | "stopped" | "error";
  cwd: string;
  detail?: string;
};

export type ExtensionUiResponse = {
  type: "extension_ui_response";
  id: string;
  value?: string;
  confirmed?: boolean;
  cancelled?: boolean;
};

export interface PiDesktopApi {
  minimizeWindow(): Promise<void>;
  toggleWindowMaximize(): Promise<boolean>;
  closeWindow(): Promise<void>;
  getWindowMaximized(): Promise<boolean>;
  onWindowMaximized(listener: (maximized: boolean) => void): () => void;
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
  send(command: RpcCommand): Promise<RpcMessage>;
  listWorkspaceDirectory(path: string): Promise<WorkspaceDirectoryListing>;
  readWorkspaceFile(path: string): Promise<WorkspaceTextFile>;
  respondToExtension(response: ExtensionUiResponse): Promise<void>;
  onAgentEvent(listener: (event: AgentEvent) => void): () => void;
  onStatus(listener: (status: ProcessStatus) => void): () => void;
  onProviderAuthEvent(listener: (event: ProviderAuthUiEvent) => void): () => void;
}
