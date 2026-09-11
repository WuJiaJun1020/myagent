import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionUiResponse, RpcCommand } from "../shared/rpc";
import { PiProcess } from "./pi-process";

let mainWindow: BrowserWindow | null = null;
let pi: PiProcess;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#f5f6f7",
    title: "Pi Desktop",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env.PI_CLIENT_DEV_URL;
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(join(__dirname, "../renderer/index.html"));
  return window;
}

function registerIpc(): void {
  ipcMain.handle("pi:get-status", () => pi.getStatus());
  ipcMain.handle("pi:send", (_event, command: RpcCommand) => pi.send(command));
  ipcMain.handle("pi:restart", async () => {
    await pi.restart();
    return pi.getStatus();
  });
  ipcMain.handle("pi:select-workspace", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "选择 Pi 工作区",
      properties: ["openDirectory"],
    });
    if (!result.canceled && result.filePaths[0]) await pi.restart(result.filePaths[0]);
    return pi.getStatus();
  });
  ipcMain.handle("pi:extension-response", (_event, response: ExtensionUiResponse) => {
    pi.sendWithoutResponse(response);
  });
}

function getSmokeResultPath(): string | undefined {
  if (process.env.PI_CLIENT_SMOKE_RESULT) return process.env.PI_CLIENT_SMOKE_RESULT;
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (!portableDir) return undefined;
  const requestPath = join(portableDir, ".portable-smoke-request");
  return existsSync(requestPath) ? join(portableDir, ".portable-smoke-result.json") : undefined;
}

async function runPackagedSmokeTest(resultPath: string): Promise<void> {
  pi = new PiProcess(process.cwd(), app.getAppPath());

  try {
    await pi.start();
    const response = await pi.send({ type: "get_state" }, 30_000);
    await writeFile(resultPath, JSON.stringify({
      success: true,
      command: response.command,
      model: (response.data as { model?: { id?: string } } | undefined)?.model?.id,
      appPath: app.getAppPath(),
    }, null, 2), "utf8");
    await pi.stop();
    app.exit(0);
  } catch (error) {
    await writeFile(resultPath, JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      appPath: app.getAppPath(),
    }, null, 2), "utf8");
    await pi.stop();
    app.exit(1);
  }
}

app.whenReady().then(async () => {
  const smokeResultPath = getSmokeResultPath();
  if (smokeResultPath) {
    await runPackagedSmokeTest(smokeResultPath);
    return;
  }

  pi = new PiProcess(process.cwd(), app.getAppPath());
  pi.on("event", (event) => mainWindow?.webContents.send("pi:event", event));
  pi.on("status", (status) => mainWindow?.webContents.send("pi:status", status));
  pi.on("diagnostic", (text) => mainWindow?.webContents.send("pi:diagnostic", text));
  registerIpc();
  mainWindow = createWindow();
  await pi.start();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void pi?.stop();
});
