import { contextBridge, ipcRenderer } from "electron";
import type { AgentEvent } from "../shared/contracts/agent-events";
import type { ProviderAuthUiEvent } from "../shared/contracts/provider-auth";
import type { ExtensionUiResponse, PiDesktopApi, ProcessStatus, RpcCommand, RpcMessage } from "../shared/rpc";

const api: PiDesktopApi = {
  getStatus: () => ipcRenderer.invoke("pi:get-status") as Promise<ProcessStatus>,
  selectWorkspace: () => ipcRenderer.invoke("pi:select-workspace") as Promise<ProcessStatus>,
  restart: () => ipcRenderer.invoke("pi:restart") as Promise<ProcessStatus>,
  getRuntimeSnapshot: () => ipcRenderer.invoke("pi:get-runtime-snapshot"),
  getSessionState: () => ipcRenderer.invoke("pi:get-session-state"),
  newSession: (mode) => ipcRenderer.invoke("pi:new-session", mode),
  switchSession: (sessionId) => ipcRenderer.invoke("pi:switch-session", sessionId),
  renameSession: (sessionId, name) => ipcRenderer.invoke("pi:rename-session", sessionId, name),
  deleteSession: (sessionId) => ipcRenderer.invoke("pi:delete-session", sessionId),
  setSessionMode: (mode) => ipcRenderer.invoke("pi:set-session-mode", mode),
  setApprovalPolicy: (policy) => ipcRenderer.invoke("pi:set-approval-policy", policy),
  setModel: (provider, modelId) => ipcRenderer.invoke("pi:set-model", provider, modelId),
  setThinkingLevel: (level) => ipcRenderer.invoke("pi:set-thinking-level", level),
  getRuntimeResources: () => ipcRenderer.invoke("pi:get-runtime-resources"),
  getProviders: () => ipcRenderer.invoke("pi:get-providers"),
  loginProvider: (providerId, method, flowId) => ipcRenderer.invoke("pi:login-provider", providerId, method, flowId),
  logoutProvider: (providerId) => ipcRenderer.invoke("pi:logout-provider", providerId),
  cancelProviderLogin: (flowId) => ipcRenderer.invoke("pi:cancel-provider-login", flowId),
  respondToProviderAuth: (response) => ipcRenderer.invoke("pi:provider-auth-response", response),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  listWorkspaceDirectory: (path) => ipcRenderer.invoke("workspace:list-directory", path),
  readWorkspaceFile: (path) => ipcRenderer.invoke("workspace:read-file", path),
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
