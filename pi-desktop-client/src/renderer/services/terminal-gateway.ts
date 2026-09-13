import type {
  TerminalCreateRequest,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalProfile,
  TerminalSession,
} from "../../shared/contracts/terminal";

export interface TerminalGateway {
  getProfiles(): Promise<TerminalProfile[]>;
  create(request: TerminalCreateRequest): Promise<TerminalSession>;
  write(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  clear(id: string): void;
  kill(id: string): Promise<void>;
  subscribeData(listener: (event: TerminalDataEvent) => void): () => void;
  subscribeExit(listener: (event: TerminalExitEvent) => void): () => void;
}

class DesktopTerminalGateway implements TerminalGateway {
  getProfiles(): Promise<TerminalProfile[]> {
    return window.piDesktop.getTerminalProfiles();
  }

  create(request: TerminalCreateRequest): Promise<TerminalSession> {
    return window.piDesktop.createTerminal(request);
  }

  write(id: string, data: string): void {
    window.piDesktop.writeTerminal(id, data);
  }

  resize(id: string, cols: number, rows: number): void {
    window.piDesktop.resizeTerminal(id, cols, rows);
  }

  clear(id: string): void {
    window.piDesktop.clearTerminal(id);
  }

  kill(id: string): Promise<void> {
    return window.piDesktop.killTerminal(id);
  }

  subscribeData(listener: (event: TerminalDataEvent) => void): () => void {
    return window.piDesktop.onTerminalData(listener);
  }

  subscribeExit(listener: (event: TerminalExitEvent) => void): () => void {
    return window.piDesktop.onTerminalExit(listener);
  }
}

export const terminalGateway: TerminalGateway = new DesktopTerminalGateway();
