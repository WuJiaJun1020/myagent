import { contextBridge, ipcRenderer } from "electron";
import type { ExtensionUiResponse, PiDesktopApi, ProcessStatus, RpcCommand, RpcMessage } from "../shared/rpc";

const api: PiDesktopApi = {
  getStatus: () => ipcRenderer.invoke("pi:get-status") as Promise<ProcessStatus>,
  selectWorkspace: () => ipcRenderer.invoke("pi:select-workspace") as Promise<ProcessStatus>,
  restart: () => ipcRenderer.invoke("pi:restart") as Promise<ProcessStatus>,
  send: (command: RpcCommand) => ipcRenderer.invoke("pi:send", command) as Promise<RpcMessage>,
  respondToExtension: (response: ExtensionUiResponse) =>
    ipcRenderer.invoke("pi:extension-response", response) as Promise<void>,
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, message: RpcMessage) => listener(message);
    ipcRenderer.on("pi:event", handler);
    return () => ipcRenderer.removeListener("pi:event", handler);
  },
  onStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: ProcessStatus) => listener(status);
    ipcRenderer.on("pi:status", handler);
    return () => ipcRenderer.removeListener("pi:status", handler);
  },
};

contextBridge.exposeInMainWorld("piDesktop", api);
