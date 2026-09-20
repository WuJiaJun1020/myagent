import type { AgentEvent } from "./contracts/agent-events";
import type {
  AgentRuntimeSnapshot,
  AgentSessionConfiguration,
  ApprovalPolicy,
  ImageAttachment,
  QueueProcessingMode,
  SessionMode,
  SessionOverview,
  SessionTreeNavigation,
  SessionTreeNavigationOptions,
  ThinkingLevel,
} from "./contracts/agent-session";
import type { RuntimeResourceMutation, RuntimeResourceSnapshot } from "./contracts/runtime-resources";
import type { PackageCatalogDetails, PackageCatalogQuery, PackageCatalogResult } from "./contracts/package-catalog";
import type { PiHostSettingsState, PiSettingsPatch, ProjectTrustState } from "./contracts/pi-settings";
import type {
  ProviderAuthResponse,
  ProviderAuthType,
  ProviderAuthUiEvent,
  ProviderSnapshot,
} from "./contracts/provider-auth";
import type {
  FileChange,
  WorkspaceDirectoryListing,
  WorkspaceFileSaveRequest,
  WorkspaceFileReference,
  WorkspaceGitDiff,
  WorkspaceGitDiffScope,
  WorkspaceGitStatus,
  WorkspaceTextFile,
} from "./contracts/workspace";
import type {
  TerminalCreateRequest,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalProfile,
  TerminalSession,
} from "./contracts/terminal";

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
  rendererReady(theme: "light" | "dark"): void;
  minimizeWindow(): Promise<void>;
  toggleWindowMaximize(): Promise<boolean>;
  closeWindow(): Promise<void>;
  getWindowMaximized(): Promise<boolean>;
  onWindowMaximized(listener: (maximized: boolean) => void): () => void;
  getStatus(): Promise<ProcessStatus>;
  selectWorkspace(): Promise<ProcessStatus>;
  restart(): Promise<ProcessStatus>;
  getRuntimeSnapshot(): Promise<AgentRuntimeSnapshot>;
  getSessionConfiguration(): Promise<AgentSessionConfiguration>;
  selectImages(maxAttachments: number): Promise<ImageAttachment[]>;
  addImageData(items: Array<{ name: string; mimeType: string; data: Uint8Array }>, maxAttachments: number): Promise<ImageAttachment[]>;
  discardImages(imageIds: string[]): Promise<void>;
  sendPrompt(message: string, imageIds: string[], streamingBehavior?: "steer" | "followUp"): Promise<void>;
  getSessionOverview(): Promise<SessionOverview>;
  newSession(mode: SessionMode): Promise<AgentRuntimeSnapshot>;
  switchSession(sessionId: string): Promise<AgentRuntimeSnapshot>;
  cloneCurrentSession(): Promise<AgentRuntimeSnapshot>;
  forkCurrentSession(entryId: string): Promise<AgentRuntimeSnapshot>;
  navigateSessionTree(entryId: string, options: SessionTreeNavigationOptions): Promise<SessionTreeNavigation>;
  exportCurrentSessionHtml(): Promise<string | null>;
  exportCurrentSessionJsonl(): Promise<string | null>;
  importSession(): Promise<AgentRuntimeSnapshot | null>;
  renameSession(sessionId: string, name: string): Promise<AgentRuntimeSnapshot>;
  deleteSession(sessionId: string): Promise<AgentRuntimeSnapshot>;
  setSessionMode(mode: SessionMode): Promise<AgentRuntimeSnapshot>;
  setApprovalPolicy(policy: ApprovalPolicy): Promise<AgentRuntimeSnapshot>;
  setSteeringMode(mode: QueueProcessingMode): Promise<AgentRuntimeSnapshot>;
  setFollowUpMode(mode: QueueProcessingMode): Promise<AgentRuntimeSnapshot>;
  setAutoCompaction(enabled: boolean): Promise<AgentRuntimeSnapshot>;
  setAutoRetry(enabled: boolean): Promise<AgentRuntimeSnapshot>;
  setModel(provider: string, modelId: string): Promise<AgentRuntimeSnapshot>;
  setThinkingLevel(level: ThinkingLevel): Promise<AgentRuntimeSnapshot>;
  getRuntimeResources(): Promise<RuntimeResourceSnapshot>;
  reloadRuntimeResources(): Promise<RuntimeResourceSnapshot>;
  mutateRuntimeResources(mutation: RuntimeResourceMutation): Promise<RuntimeResourceSnapshot>;
  searchPackageCatalog(query: PackageCatalogQuery): Promise<PackageCatalogResult>;
  getPackageCatalogDetails(packageName: string): Promise<PackageCatalogDetails>;
  getPiSettings(): Promise<PiHostSettingsState>;
  updatePiSettings(patch: PiSettingsPatch): Promise<PiHostSettingsState>;
  getProjectTrust(): Promise<ProjectTrustState>;
  setProjectTrust(decision: boolean | null, target?: "current" | "parent"): Promise<ProjectTrustState>;
  getProviders(): Promise<ProviderSnapshot>;
  loginProvider(providerId: string, method: ProviderAuthType, flowId: string): Promise<ProviderSnapshot>;
  logoutProvider(providerId: string): Promise<ProviderSnapshot>;
  cancelProviderLogin(flowId: string): Promise<void>;
  respondToProviderAuth(response: ProviderAuthResponse): Promise<void>;
  openExternal(url: string): Promise<void>;
  setWindowTitle(title?: string): Promise<void>;
  send(command: RpcCommand): Promise<RpcMessage>;
  listWorkspaceDirectory(path: string): Promise<WorkspaceDirectoryListing>;
  searchWorkspaceFiles(query: string): Promise<WorkspaceFileReference[]>;
  readWorkspaceFile(path: string): Promise<WorkspaceTextFile>;
  saveWorkspaceFile(request: WorkspaceFileSaveRequest): Promise<WorkspaceTextFile>;
  revertAgentFileChange(change: FileChange): Promise<void>;
  saveAgentTurnFileChanges(sessionId: string, turnIndex: number, changes: FileChange[]): Promise<void>;
  getWorkspaceGitStatus(): Promise<WorkspaceGitStatus>;
  getWorkspaceGitDiff(path: string, scope: WorkspaceGitDiffScope, contextLines?: number): Promise<WorkspaceGitDiff>;
  getTerminalProfiles(): Promise<TerminalProfile[]>;
  createTerminal(request: TerminalCreateRequest): Promise<TerminalSession>;
  writeTerminal(id: string, data: string): void;
  resizeTerminal(id: string, cols: number, rows: number): void;
  clearTerminal(id: string): void;
  killTerminal(id: string): Promise<void>;
  onTerminalData(listener: (event: TerminalDataEvent) => void): () => void;
  onTerminalExit(listener: (event: TerminalExitEvent) => void): () => void;
  respondToExtension(response: ExtensionUiResponse): Promise<void>;
  onAgentEvent(listener: (event: AgentEvent) => void): () => void;
  onStatus(listener: (status: ProcessStatus) => void): () => void;
  onProviderAuthEvent(listener: (event: ProviderAuthUiEvent) => void): () => void;
}
