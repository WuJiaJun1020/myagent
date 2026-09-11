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
  getStatus(): Promise<ProcessStatus>;
  selectWorkspace(): Promise<ProcessStatus>;
  restart(): Promise<ProcessStatus>;
  send(command: RpcCommand): Promise<RpcMessage>;
  respondToExtension(response: ExtensionUiResponse): Promise<void>;
  onEvent(listener: (event: RpcMessage) => void): () => void;
  onStatus(listener: (status: ProcessStatus) => void): () => void;
}
