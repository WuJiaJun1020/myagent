import { contextBridge, ipcRenderer } from "electron";
import type { AgentEvent } from "../shared/contracts/agent-events";
import type { ProviderAuthUiEvent } from "../shared/contracts/provider-auth";
import type { RuntimeResourceMutation } from "../shared/contracts/runtime-resources";
import type { PackageCatalogQuery } from "../shared/contracts/package-catalog";
import type { TerminalDataEvent, TerminalExitEvent } from "../shared/contracts/terminal";
import type { ExtensionUiResponse, PiDesktopApi, ProcessStatus, RpcCommand, RpcMessage } from "../shared/rpc";

const api: PiDesktopApi = {
  rendererReady: (theme) => ipcRenderer.send("app:renderer-ready", theme),
  minimizeWindow: () => ipcRenderer.invoke("app:window-minimize") as Promise<void>,
  toggleWindowMaximize: () => ipcRenderer.invoke("app:window-toggle-maximize") as Promise<boolean>,
  closeWindow: () => ipcRenderer.invoke("app:window-close") as Promise<void>,
  getWindowMaximized: () => ipcRenderer.invoke("app:window-get-maximized") as Promise<boolean>,
  onWindowMaximized: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => listener(maximized);
    ipcRenderer.on("app:window-maximized", handler);
    return () => ipcRenderer.removeListener("app:window-maximized", handler);
  },
  getStatus: () => ipcRenderer.invoke("pi:get-status") as Promise<ProcessStatus>,
  selectWorkspace: () => ipcRenderer.invoke("pi:select-workspace") as Promise<ProcessStatus>,
  restart: () => ipcRenderer.invoke("pi:restart") as Promise<ProcessStatus>,
  getRuntimeSnapshot: () => ipcRenderer.invoke("pi:get-runtime-snapshot"),
  getSessionConfiguration: () => ipcRenderer.invoke("pi:get-session-configuration"),
  selectImages: (maxAttachments) => ipcRenderer.invoke("pi:select-images", maxAttachments),
  addImageData: (items, maxAttachments) => ipcRenderer.invoke("pi:add-image-data", items, maxAttachments),
  discardImages: (imageIds) => ipcRenderer.invoke("pi:discard-images", imageIds),
  sendPrompt: (message, imageIds, streamingBehavior) => ipcRenderer.invoke("pi:send-prompt", message, imageIds, streamingBehavior),
  getSessionOverview: () => ipcRenderer.invoke("pi:get-session-overview"),
  newSession: (mode) => ipcRenderer.invoke("pi:new-session", mode),
  switchSession: (sessionId) => ipcRenderer.invoke("pi:switch-session", sessionId),
  cloneCurrentSession: () => ipcRenderer.invoke("pi:clone-current-session"),
  forkCurrentSession: (entryId) => ipcRenderer.invoke("pi:fork-current-session", entryId),
  navigateSessionTree: (entryId, options) => ipcRenderer.invoke("pi:navigate-session-tree", entryId, options),
  exportCurrentSessionHtml: () => ipcRenderer.invoke("pi:export-current-session-html"),
  exportCurrentSessionJsonl: () => ipcRenderer.invoke("pi:export-current-session-jsonl"),
  importSession: () => ipcRenderer.invoke("pi:import-session"),
  renameSession: (sessionId, name) => ipcRenderer.invoke("pi:rename-session", sessionId, name),
  deleteSession: (sessionId) => ipcRenderer.invoke("pi:delete-session", sessionId),
  setSessionMode: (mode) => ipcRenderer.invoke("pi:set-session-mode", mode),
  setApprovalPolicy: (policy) => ipcRenderer.invoke("pi:set-approval-policy", policy),
  setSteeringMode: (mode) => ipcRenderer.invoke("pi:set-steering-mode", mode),
  setFollowUpMode: (mode) => ipcRenderer.invoke("pi:set-follow-up-mode", mode),
  setAutoCompaction: (enabled) => ipcRenderer.invoke("pi:set-auto-compaction", enabled),
  setAutoRetry: (enabled) => ipcRenderer.invoke("pi:set-auto-retry", enabled),
  setModel: (provider, modelId) => ipcRenderer.invoke("pi:set-model", provider, modelId),
  setThinkingLevel: (level) => ipcRenderer.invoke("pi:set-thinking-level", level),
  getRuntimeResources: () => ipcRenderer.invoke("pi:get-runtime-resources"),
  reloadRuntimeResources: () => ipcRenderer.invoke("pi:reload-runtime-resources"),
  mutateRuntimeResources: (mutation: RuntimeResourceMutation) => ipcRenderer.invoke("pi:mutate-runtime-resources", mutation),
  searchPackageCatalog: (query: PackageCatalogQuery) => ipcRenderer.invoke("pi:search-package-catalog", query),
  getPackageCatalogDetails: (packageName) => ipcRenderer.invoke("pi:get-package-catalog-details", packageName),
  getPiSettings: () => ipcRenderer.invoke("pi:get-settings"),
  updatePiSettings: (patch) => ipcRenderer.invoke("pi:update-settings", patch),
  getProjectTrust: () => ipcRenderer.invoke("pi:get-project-trust"),
  setProjectTrust: (decision, target) => ipcRenderer.invoke("pi:set-project-trust", decision, target),
  getProviders: () => ipcRenderer.invoke("pi:get-providers"),
  loginProvider: (providerId, method, flowId) => ipcRenderer.invoke("pi:login-provider", providerId, method, flowId),
  logoutProvider: (providerId) => ipcRenderer.invoke("pi:logout-provider", providerId),
  cancelProviderLogin: (flowId) => ipcRenderer.invoke("pi:cancel-provider-login", flowId),
  respondToProviderAuth: (response) => ipcRenderer.invoke("pi:provider-auth-response", response),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  setWindowTitle: (title) => ipcRenderer.invoke("app:set-window-title", title),
  listWorkspaceDirectory: (path) => ipcRenderer.invoke("workspace:list-directory", path),
  searchWorkspaceFiles: (query) => ipcRenderer.invoke("workspace:search-files", query),
  readWorkspaceFile: (path) => ipcRenderer.invoke("workspace:read-file", path),
  saveWorkspaceFile: (request) => ipcRenderer.invoke("workspace:save-file", request),
  revertAgentFileChange: (change) => ipcRenderer.invoke("workspace:revert-agent-change", change),
  saveAgentTurnFileChanges: (sessionId, turnIndex, changes) =>
    ipcRenderer.invoke("workspace:save-turn-file-changes", sessionId, turnIndex, changes),
  getWorkspaceGitStatus: () => ipcRenderer.invoke("workspace:get-git-status"),
  getWorkspaceGitDiff: (path, scope, contextLines) => ipcRenderer.invoke("workspace:get-git-diff", path, scope, contextLines),
  getTerminalProfiles: () => ipcRenderer.invoke("terminal:get-profiles"),
  createTerminal: (request) => ipcRenderer.invoke("terminal:create", request),
  writeTerminal: (id, data) => ipcRenderer.send("terminal:write", id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send("terminal:resize", id, cols, rows),
  clearTerminal: (id) => ipcRenderer.send("terminal:clear", id),
  killTerminal: (id) => ipcRenderer.invoke("terminal:kill", id),
  onTerminalData: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, terminalEvent: TerminalDataEvent) => listener(terminalEvent);
    ipcRenderer.on("terminal:data", handler);
    return () => ipcRenderer.removeListener("terminal:data", handler);
  },
  onTerminalExit: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, terminalEvent: TerminalExitEvent) => listener(terminalEvent);
    ipcRenderer.on("terminal:exit", handler);
    return () => ipcRenderer.removeListener("terminal:exit", handler);
  },
  send: (command: RpcCommand) => ipcRenderer.invoke("pi:send", command) as Promise<RpcMessage>,
  respondToExtension: (response: ExtensionUiResponse) =>
    ipcRenderer.invoke("pi:extension-response", response) as Promise<void>,
  onAgentEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, agentEvent: AgentEvent) => listener(agentEvent);
    ipcRenderer.on("agent:event", handler);
    return () => ipcRenderer.removeListener("agent:event", handler);
  },
  onStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: ProcessStatus) => listener(status);
    ipcRenderer.on("pi:status", handler);
    return () => ipcRenderer.removeListener("pi:status", handler);
  },
  onProviderAuthEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, authEvent: ProviderAuthUiEvent) => listener(authEvent);
    ipcRenderer.on("pi:provider-auth-event", handler);
    return () => ipcRenderer.removeListener("pi:provider-auth-event", handler);
  },
};

contextBridge.exposeInMainWorld("piDesktop", api);
