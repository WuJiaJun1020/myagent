import type { AgentEvent, InteractionRequest } from "../../shared/contracts/agent-events";
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
} from "../../shared/contracts/agent-session";
import type { RuntimeResourceMutation, RuntimeResourceSnapshot } from "../../shared/contracts/runtime-resources";
import type { PackageCatalogDetails, PackageCatalogQuery, PackageCatalogResult } from "../../shared/contracts/package-catalog";
import type { PiHostSettingsState, PiSettingsPatch, ProjectTrustState } from "../../shared/contracts/pi-settings";
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
  getSessionConfiguration(): Promise<AgentSessionConfiguration>;
  selectImages(maxAttachments: number): Promise<ImageAttachment[]>;
  addImageData(items: Array<{ name: string; mimeType: string; data: Uint8Array }>, maxAttachments: number): Promise<ImageAttachment[]>;
  discardImages(imageIds: string[]): Promise<void>;
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
  sendPrompt(message: string, imageIds?: string[], streamingBehavior?: "steer" | "followUp"): Promise<void>;
  compact(customInstructions?: string): Promise<void>;
  abort(): Promise<void>;
  updateQueueItem(
    source: "steer" | "followUp",
    index: number,
    action: "steer" | "followUp" | "delete",
  ): Promise<void>;
  runBash(command: string, excludeFromContext?: boolean, cwd?: string, id?: string): Promise<TerminalCommandResult>;
  abortRetry(): Promise<void>;
  respondToInteraction(request: InteractionRequest, response: Omit<ExtensionUiResponse, "type" | "id">): Promise<void>;
  subscribe(listener: (event: AgentEvent) => void): () => void;
  subscribeStatus(listener: (status: ProcessStatus) => void): () => void;
  subscribeProviderAuth(listener: (event: ProviderAuthUiEvent) => void): () => void;
}

export type TerminalCommandResult = {
  exitCode?: number;
  cancelled: boolean;
  truncated: boolean;
};

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

  getSessionConfiguration(): Promise<AgentSessionConfiguration> {
    return window.piDesktop.getSessionConfiguration();
  }

  selectImages(maxAttachments: number): Promise<ImageAttachment[]> {
    return window.piDesktop.selectImages(maxAttachments);
  }

  addImageData(items: Array<{ name: string; mimeType: string; data: Uint8Array }>, maxAttachments: number): Promise<ImageAttachment[]> {
    return window.piDesktop.addImageData(items, maxAttachments);
  }

  discardImages(imageIds: string[]): Promise<void> {
    return window.piDesktop.discardImages(imageIds);
  }

  getSessionOverview(): Promise<SessionOverview> {
    return window.piDesktop.getSessionOverview();
  }

  newSession(mode: SessionMode): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.newSession(mode);
  }

  switchSession(sessionId: string): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.switchSession(sessionId);
  }

  cloneCurrentSession(): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.cloneCurrentSession();
  }

  forkCurrentSession(entryId: string): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.forkCurrentSession(entryId);
  }

  navigateSessionTree(entryId: string, options: SessionTreeNavigationOptions): Promise<SessionTreeNavigation> {
    return window.piDesktop.navigateSessionTree(entryId, options);
  }

  exportCurrentSessionHtml(): Promise<string | null> {
    return window.piDesktop.exportCurrentSessionHtml();
  }

  exportCurrentSessionJsonl(): Promise<string | null> {
    return window.piDesktop.exportCurrentSessionJsonl();
  }

  importSession(): Promise<AgentRuntimeSnapshot | null> {
    return window.piDesktop.importSession();
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

  setSteeringMode(mode: QueueProcessingMode): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.setSteeringMode(mode);
  }

  setFollowUpMode(mode: QueueProcessingMode): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.setFollowUpMode(mode);
  }

  setAutoCompaction(enabled: boolean): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.setAutoCompaction(enabled);
  }

  setAutoRetry(enabled: boolean): Promise<AgentRuntimeSnapshot> {
    return window.piDesktop.setAutoRetry(enabled);
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

  reloadRuntimeResources(): Promise<RuntimeResourceSnapshot> {
    return window.piDesktop.reloadRuntimeResources();
  }

  mutateRuntimeResources(mutation: RuntimeResourceMutation): Promise<RuntimeResourceSnapshot> {
    return window.piDesktop.mutateRuntimeResources(mutation);
  }

  searchPackageCatalog(query: PackageCatalogQuery): Promise<PackageCatalogResult> {
    return window.piDesktop.searchPackageCatalog(query);
  }

  getPackageCatalogDetails(packageName: string): Promise<PackageCatalogDetails> {
    return window.piDesktop.getPackageCatalogDetails(packageName);
  }

  getPiSettings(): Promise<PiHostSettingsState> {
    return window.piDesktop.getPiSettings();
  }

  updatePiSettings(patch: PiSettingsPatch): Promise<PiHostSettingsState> {
    return window.piDesktop.updatePiSettings(patch);
  }

  getProjectTrust(): Promise<ProjectTrustState> {
    return window.piDesktop.getProjectTrust();
  }

  setProjectTrust(decision: boolean | null, target?: "current" | "parent"): Promise<ProjectTrustState> {
    return window.piDesktop.setProjectTrust(decision, target);
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

  async sendPrompt(message: string, imageIds: string[] = [], streamingBehavior?: "steer" | "followUp"): Promise<void> {
    await window.piDesktop.sendPrompt(message, imageIds, streamingBehavior);
  }

  async compact(customInstructions?: string): Promise<void> {
    await window.piDesktop.send({ type: "compact", customInstructions });
  }

  async abort(): Promise<void> {
    await window.piDesktop.send({ type: "abort" });
  }

  async updateQueueItem(
    source: "steer" | "followUp",
    index: number,
    action: "steer" | "followUp" | "delete",
  ): Promise<void> {
    await window.piDesktop.send({
      type: "update_queue_item",
      source: source === "followUp" ? "follow_up" : source,
      index,
      action: action === "followUp" ? "follow_up" : action,
    });
  }

  async runBash(command: string, excludeFromContext = false, cwd?: string, id?: string): Promise<TerminalCommandResult> {
    const normalizedCwd = cwd?.replaceAll("\\", "/");
    const shellCommand = normalizedCwd
      ? `cd -- '${normalizedCwd.replaceAll("'", "'\"'\"'")}' && {\n${command}\n}`
      : command;
    const response = await window.piDesktop.send({ id, type: "bash", command: shellCommand, excludeFromContext });
    const data = response.data;
    if (!data || typeof data !== "object") return { cancelled: false, truncated: false };
    return {
      exitCode: typeof (data as { exitCode?: unknown }).exitCode === "number"
        ? (data as { exitCode: number }).exitCode
        : undefined,
      cancelled: (data as { cancelled?: unknown }).cancelled === true,
      truncated: (data as { truncated?: unknown }).truncated === true,
    };
  }

  async abortRetry(): Promise<void> {
    await window.piDesktop.send({ type: "abort_retry" });
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
