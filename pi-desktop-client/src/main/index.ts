import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionUiResponse, RpcCommand } from "../shared/rpc";
import { PiEventAdapter } from "./agent/pi-event-adapter";
import { PiSessionService } from "./agent/pi-session-service";
import { PiResourceService } from "./agent/pi-resource-service";
import { adaptProviderAuthEvent, PiProviderService } from "./agent/pi-provider-service";
import { PiProcess } from "./pi-process";
import { sendToRenderer } from "./send-to-renderer";
import { FileChangeTracker, WorkspaceFileService } from "./workspace/workspace-files";

let mainWindow: BrowserWindow | null = null;
let pi: PiProcess;
let workspaceFiles: WorkspaceFileService;
let fileChangeTracker: FileChangeTracker;
let sessionService: PiSessionService;
let resourceService: PiResourceService;
let providerService: PiProviderService;
let agentEventQueue = Promise.resolve();
const eventAdapter = new PiEventAdapter();

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#0d1118",
    title: "Pi Desktop",
    frame: false,
    autoHideMenuBar: true,
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
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.on("maximize", () => sendToRenderer(window, "app:window-maximized", true));
  window.on("unmaximize", () => sendToRenderer(window, "app:window-maximized", false));
  return window;
}

function registerIpc(): void {
  ipcMain.handle("app:window-minimize", () => mainWindow?.minimize());
  ipcMain.handle("app:window-toggle-maximize", () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle("app:window-close", () => mainWindow?.close());
  ipcMain.handle("app:window-get-maximized", () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle("pi:get-status", () => pi.getStatus());
  ipcMain.handle("pi:get-runtime-snapshot", () => sessionService.getSnapshot(true));
  ipcMain.handle("pi:get-session-state", () => sessionService.getSessionState());
  ipcMain.handle("pi:new-session", (_event, mode: unknown) => {
    fileChangeTracker.clear();
    return sessionService.newSession(mode);
  });
  ipcMain.handle("pi:switch-session", (_event, sessionId: unknown) => {
    fileChangeTracker.clear();
    return sessionService.switchSession(sessionId);
  });
  ipcMain.handle("pi:rename-session", (_event, sessionId: unknown, name: unknown) => sessionService.renameSession(sessionId, name));
  ipcMain.handle("pi:delete-session", (_event, sessionId: unknown) => {
    fileChangeTracker.clear();
    return sessionService.deleteSession(sessionId);
  });
  ipcMain.handle("pi:set-session-mode", (_event, mode: unknown) => sessionService.setSessionMode(mode));
  ipcMain.handle("pi:set-approval-policy", (_event, policy: unknown) => sessionService.setApprovalPolicy(policy));
  ipcMain.handle("pi:set-model", (_event, provider: unknown, modelId: unknown) => sessionService.setModel(provider, modelId));
  ipcMain.handle("pi:set-thinking-level", (_event, level: unknown) => sessionService.setThinkingLevel(level));
  ipcMain.handle("pi:get-runtime-resources", () => resourceService.getSnapshot());
  ipcMain.handle("pi:get-providers", () => providerService.getSnapshot());
  ipcMain.handle("pi:login-provider", (_event, providerId: unknown, method: unknown, flowId: unknown) =>
    providerService.login(providerId, method, flowId));
  ipcMain.handle("pi:logout-provider", (_event, providerId: unknown) => providerService.logout(providerId));
  ipcMain.handle("pi:cancel-provider-login", (_event, flowId: unknown) => providerService.cancel(flowId));
  ipcMain.handle("pi:provider-auth-response", (_event, response) => providerService.respond(response));
  ipcMain.handle("app:open-external", async (_event, value: unknown) => {
    if (typeof value !== "string" || value.length > 2_048) throw new Error("外部链接无效");
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("仅允许打开 HTTP(S) 链接");
    await shell.openExternal(url.toString());
  });
  ipcMain.handle("pi:send", (_event, command: RpcCommand) => pi.send(command));
  ipcMain.handle("pi:restart", async () => {
    fileChangeTracker.clear();
    eventAdapter.beginSession();
    await pi.restart();
    return pi.getStatus();
  });
  ipcMain.handle("pi:select-workspace", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "选择 Pi 工作区",
      properties: ["openDirectory"],
    });
    if (!result.canceled && result.filePaths[0]) {
      fileChangeTracker.clear();
      eventAdapter.beginSession();
      await pi.restart(result.filePaths[0]);
    }
    return pi.getStatus();
  });
  ipcMain.handle("workspace:list-directory", (_event, path: unknown) => workspaceFiles.listDirectory(path));
  ipcMain.handle("workspace:read-file", (_event, path: unknown) => workspaceFiles.readFile(path));
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
  workspaceFiles = new WorkspaceFileService(() => pi.getStatus().cwd);
  fileChangeTracker = new FileChangeTracker(workspaceFiles);
  sessionService = new PiSessionService(pi, eventAdapter, (path) => shell.trashItem(path));
  resourceService = new PiResourceService(pi);
  providerService = new PiProviderService(pi);
  pi.on("event", (event) => {
    const providerAuthEvent = adaptProviderAuthEvent(event);
    if (providerAuthEvent) sendToRenderer(mainWindow, "pi:provider-auth-event", providerAuthEvent);
    agentEventQueue = agentEventQueue.then(async () => {
      let fileChange;
      try {
        await fileChangeTracker.captureStart(event);
        fileChange = await fileChangeTracker.captureEnd(event);
      } catch (error) {
        sendToRenderer(mainWindow, "pi:diagnostic", `文件变更跟踪失败：${error instanceof Error ? error.message : String(error)}`);
      }
      for (const agentEvent of eventAdapter.adapt(event, fileChange)) {
        sendToRenderer(mainWindow, "agent:event", agentEvent);
      }
    }).catch((error: unknown) => {
      sendToRenderer(mainWindow, "pi:diagnostic", `Agent 事件处理失败：${error instanceof Error ? error.message : String(error)}`);
    });
  });
  pi.on("status", (status) => sendToRenderer(mainWindow, "pi:status", status));
  pi.on("diagnostic", (text) => sendToRenderer(mainWindow, "pi:diagnostic", text));
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
