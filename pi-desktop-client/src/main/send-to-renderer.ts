export type RendererWindow = {
  isDestroyed(): boolean;
  webContents: {
    isDestroyed(): boolean;
    send(channel: string, payload: unknown): void;
  };
};

/**
 * Renderer events can still arrive while Electron is tearing a window down.
 * Treat a missing/destroyed renderer as an expected shutdown condition.
 */
export function sendToRenderer(
  window: RendererWindow | null,
  channel: string,
  payload: unknown,
): boolean {
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return false;

  try {
    window.webContents.send(channel, payload);
    return true;
  } catch {
    // The native BrowserWindow may be destroyed between the guard and send().
    return false;
  }
}
