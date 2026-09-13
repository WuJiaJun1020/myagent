import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionUiResponse, RpcCommand } from "../shared/rpc";
import type { TerminalCreateRequest } from "../shared/contracts/terminal";
import type { FileChange, WorkspaceFileSaveRequest } from "../shared/contracts/workspace";
import type { PiHostSettingsState, PiSettingsPatch, ProjectTrustState } from "../shared/contracts/pi-settings";
import type { SessionTreeNavigationOptions } from "../shared/contracts/agent-session";
import type { RuntimeResourceMutation } from "../shared/contracts/runtime-resources";
import type { PackageCatalogQuery } from "../shared/contracts/package-catalog";
import { PiEventAdapter } from "./agent/pi-event-adapter";
import { ImageAttachmentStore } from "./agent/image-attachments";
import { PiSessionService } from "./agent/pi-session-service";
import { PiResourceService } from "./agent/pi-resource-service";
import { PiPackageCatalogService } from "./agent/pi-package-catalog-service";
import { adaptProviderAuthEvent, PiProviderService } from "./agent/pi-provider-service";
import { PiProcess } from "./pi-process";
import { sendToRenderer } from "./send-to-renderer";
import { FileChangeTracker, WorkspaceFileService } from "./workspace/workspace-files";
import { WorkspaceGitService } from "./workspace/workspace-git";
import { TerminalService } from "./terminal/terminal-service";

let mainWindow: BrowserWindow | null = null;
let pi: PiProcess;
let workspaceFiles: WorkspaceFileService;
let workspaceGit: WorkspaceGitService;
let fileChangeTracker: FileChangeTracker;
let sessionService: PiSessionService;
let resourceService: PiResourceService;
const packageCatalogService = new PiPackageCatalogService();
let providerService: PiProviderService;
let imageAttachments: ImageAttachmentStore;
let terminalService: TerminalService;
let agentEventQueue = Promise.resolve();
const eventAdapter = new PiEventAdapter();

function rpcData<T>(response: { data?: unknown; command?: string }): T {
  if (!response.data || typeof response.data !== "object") throw new Error(`Pi RPC ${response.command ?? "响应"} 缺少有效数据`);
  return response.data as T;
}

function parseResourceMutation(value: unknown): RuntimeResourceMutation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("资源操作无效");
  const mutation = value as Record<string, unknown>;
  const scope = mutation.scope === "user" || mutation.scope === "project" ? mutation.scope : undefined;
  if (!scope) throw new Error("资源作用域无效");
  if (mutation.type === "install" || mutation.type === "remove" || mutation.type === "update") {
    if (typeof mutation.source !== "string" || !mutation.source.trim() || mutation.source.length > 2_048) {
      throw new Error("Package 来源无效");
    }
    return { type: mutation.type, source: mutation.source.trim(), scope };
  }
  if (mutation.type !== "set-enabled") throw new Error("不支持的资源操作");
  const resourceType = mutation.resourceType === "extensions"
    || mutation.resourceType === "skills"
    || mutation.resourceType === "prompts"
    || mutation.resourceType === "themes"
    ? mutation.resourceType
    : undefined;
  if (!resourceType || typeof mutation.path !== "string" || typeof mutation.source !== "string") {
    throw new Error("资源信息无效");
  }
  if (mutation.enabled !== true && mutation.enabled !== false) throw new Error("资源启用状态无效");
  return {
    type: "set-enabled",
    resourceType,
    path: mutation.path,
    source: mutation.source,
    scope,
    enabled: mutation.enabled,
  };
}

function parsePackageCatalogQuery(value: unknown): PackageCatalogQuery {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Package 搜索参数无效");
  const query = value as Record<string, unknown>;
  if (typeof query.query !== "string" || query.query.length > 100) throw new Error("Package 搜索内容无效");
  if (typeof query.page !== "number" || !Number.isInteger(query.page) || query.page < 0 || query.page > 1_000) {
    throw new Error("Package 搜索页码无效");
  }
  if (typeof query.pageSize !== "number" || !Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 50) {
    throw new Error("Package 搜索数量无效");
  }
  return { query: query.query.trim(), page: query.page, pageSize: query.pageSize };
}

function parsePackageName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Package 名称无效");
  const name = value.trim();
  if (name.length > 214 || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/iu.test(name)) {
    throw new Error("Package 名称无效");
  }
  return name;
}

function reportTerminalError(error: unknown): void {
  sendToRenderer(mainWindow, "pi:diagnostic", `终端操作失败：${error instanceof Error ? error.message : String(error)}`);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#0d1118",
    show: false,
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

  const enforceDefaultZoom = (): void => {
    if (!window.webContents.isDestroyed()) window.webContents.setZoomFactor(1);
  };
  enforceDefaultZoom();
  window.webContents.on("did-finish-load", enforceDefaultZoom);
  window.webContents.on("zoom-changed", (event) => {
    event.preventDefault();
    enforceDefaultZoom();
  });
  window.webContents.on("before-input-event", (event, input) => {
    if ((input.control || input.meta) && ["+", "=", "-", "0"].includes(input.key)) event.preventDefault();
  });
  void window.webContents.setVisualZoomLevelLimits(1, 1);

  let revealTimeout: NodeJS.Timeout | undefined;
  const revealWindow = (theme?: "light" | "dark"): void => {
    if (revealTimeout) {
      clearTimeout(revealTimeout);
      revealTimeout = undefined;
    }
    ipcMain.removeListener("app:renderer-ready", handleRendererReady);
    if (window.isDestroyed()) return;
    if (theme) window.setBackgroundColor(theme === "light" ? "#f4f6f9" : "#0d1118");
    if (!window.isVisible()) window.show();
  };
  const handleRendererReady = (event: Electron.IpcMainEvent, theme: unknown): void => {
    if (event.sender !== window.webContents) return;
    revealWindow(theme === "light" ? "light" : "dark");
  };
  ipcMain.on("app:renderer-ready", handleRendererReady);

  const devUrl = process.env.PI_CLIENT_DEV_URL;
  const loading = devUrl
    ? window.loadURL(devUrl)
    : window.loadFile(join(__dirname, "../renderer/index.html"));
  void loading
    .then(() => {
      if (!window.isVisible()) revealTimeout = setTimeout(revealWindow, 10_000);
    })
    .catch((error: unknown) => {
      console.error("无法加载 Pi Desktop 页面", error);
      revealWindow();
    });
  window.on("closed", () => {
    if (revealTimeout) clearTimeout(revealTimeout);
    ipcMain.removeListener("app:renderer-ready", handleRendererReady);
    if (mainWindow === window) mainWindow = null;
  });
  window.on("close", () => terminalService?.disposeOwner(window.webContents.id));
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
  ipcMain.handle("pi:get-session-configuration", () => sessionService.getSessionConfiguration());
  ipcMain.handle("pi:select-images", async (_event, maximum: unknown) => {
    if (typeof maximum !== "number" || !Number.isInteger(maximum) || maximum < 1 || maximum > 4) {
      throw new Error("图片附件数量无效");
    }
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "选择图片附件",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "图片", extensions: ["jpg", "jpeg", "png", "gif", "webp"] }],
    });
    if (result.canceled) return [];
    return imageAttachments.addFiles(result.filePaths, maximum);
  });
  ipcMain.handle("pi:add-image-data", (_event, items: unknown, maximum: unknown) => {
    if (typeof maximum !== "number" || !Number.isInteger(maximum) || maximum < 1 || maximum > 4) {
      throw new Error("图片附件数量无效");
    }
    if (!Array.isArray(items) || !items.every((item) => (
      item && typeof item === "object"
      && typeof item.name === "string"
      && typeof item.mimeType === "string"
      && item.data instanceof Uint8Array
    ))) throw new Error("图片附件数据无效");
    return imageAttachments.addData(items as Array<{ name: string; mimeType: string; data: Uint8Array }>, maximum);
  });
  ipcMain.handle("pi:discard-images", (_event, imageIds: unknown) => {
    if (!Array.isArray(imageIds) || !imageIds.every((id) => typeof id === "string")) throw new Error("图片附件无效");
    imageAttachments.release(imageIds);
  });
  ipcMain.handle("pi:send-prompt", async (_event, message: unknown, imageIds: unknown, streamingBehavior: unknown) => {
    if (typeof message !== "string" || !message.trim()) throw new Error("消息不能为空");
    if (!Array.isArray(imageIds) || !imageIds.every((id) => typeof id === "string")) throw new Error("图片附件无效");
    if (streamingBehavior !== undefined && streamingBehavior !== "steer" && streamingBehavior !== "followUp") {
      throw new Error("运行中消息行为无效");
    }
    const images = imageAttachments.resolve(imageIds);
    if (images.length > 0) {
      const session = await sessionService.getSessionState();
      if (!session.model?.supportsImages) throw new Error("当前模型不支持图片输入，请切换支持视觉的模型");
    }
    await pi.send({
      type: streamingBehavior === "steer" ? "steer" : streamingBehavior === "followUp" ? "follow_up" : "prompt",
      message: message.trim(),
      ...(images.length > 0 ? { images } : {}),
    });
    imageAttachments.release(imageIds);
  });

  ipcMain.handle("pi:get-session-overview", () => sessionService.getSessionOverview());
  ipcMain.handle("pi:new-session", (_event, mode: unknown) => {
    fileChangeTracker.clear();
    return sessionService.newSession(mode);
  });
  ipcMain.handle("pi:switch-session", (_event, sessionId: unknown) => {
    fileChangeTracker.clear();
    return sessionService.switchSession(sessionId);
  });
  ipcMain.handle("pi:clone-current-session", () => {
    fileChangeTracker.clear();
    return sessionService.cloneCurrentSession();
  });
  ipcMain.handle("pi:fork-current-session", (_event, entryId: unknown) => {
    fileChangeTracker.clear();
    return sessionService.forkCurrentSession(entryId);
  });
  ipcMain.handle("pi:navigate-session-tree", (_event, entryId: unknown, options: unknown) => {
    fileChangeTracker.clear();
    return sessionService.navigateCurrentSessionTree(entryId, options as SessionTreeNavigationOptions);
  });
  ipcMain.handle("pi:export-current-session-html", async () => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: "导出 Pi 会话",
      defaultPath: "pi-session.html",
      filters: [{ name: "HTML 文件", extensions: ["html"] }],
    });
    if (result.canceled || !result.filePath) return null;
    return sessionService.exportCurrentSession(result.filePath, "html");
  });
  ipcMain.handle("pi:export-current-session-jsonl", async () => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: "导出 Pi 会话副本",
      defaultPath: "pi-session.jsonl",
      filters: [{ name: "Pi 会话", extensions: ["jsonl"] }],
    });
    if (result.canceled || !result.filePath) return null;
    return sessionService.exportCurrentSession(result.filePath, "jsonl");
  });
  ipcMain.handle("pi:import-session", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "导入 Pi 会话",
      properties: ["openFile"],
      filters: [{ name: "Pi 会话", extensions: ["jsonl"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    fileChangeTracker.clear();
    return sessionService.importSession(result.filePaths[0]);
  });
  ipcMain.handle("pi:rename-session", (_event, sessionId: unknown, name: unknown) => sessionService.renameSession(sessionId, name));
  ipcMain.handle("pi:delete-session", (_event, sessionId: unknown) => {
    fileChangeTracker.clear();
    return sessionService.deleteSession(sessionId);
  });
  ipcMain.handle("pi:set-session-mode", (_event, mode: unknown) => sessionService.setSessionMode(mode));
  ipcMain.handle("pi:set-approval-policy", (_event, policy: unknown) => sessionService.setApprovalPolicy(policy));
  ipcMain.handle("pi:set-steering-mode", (_event, mode: unknown) => sessionService.setSteeringMode(mode));
  ipcMain.handle("pi:set-follow-up-mode", (_event, mode: unknown) => sessionService.setFollowUpMode(mode));
  ipcMain.handle("pi:set-auto-compaction", (_event, enabled: unknown) => sessionService.setAutoCompaction(enabled));
  ipcMain.handle("pi:set-auto-retry", (_event, enabled: unknown) => sessionService.setAutoRetry(enabled));
  ipcMain.handle("pi:set-model", (_event, provider: unknown, modelId: unknown) => sessionService.setModel(provider, modelId));
  ipcMain.handle("pi:set-thinking-level", (_event, level: unknown) => sessionService.setThinkingLevel(level));
  ipcMain.handle("pi:get-runtime-resources", () => resourceService.getSnapshot());
  ipcMain.handle("pi:reload-runtime-resources", async () => {
    await pi.send({ type: "reload_resources" }, 60_000);
    return resourceService.getSnapshot();
  });
  ipcMain.handle("pi:mutate-runtime-resources", (_event, mutation: unknown) =>
    resourceService.mutate(parseResourceMutation(mutation)));
  ipcMain.handle("pi:search-package-catalog", (_event, query: unknown) =>
    packageCatalogService.search(parsePackageCatalogQuery(query)));
  ipcMain.handle("pi:get-package-catalog-details", (_event, packageName: unknown) =>
    packageCatalogService.getDetails(parsePackageName(packageName)));
  ipcMain.handle("pi:get-settings", async () => rpcData<PiHostSettingsState>(await pi.send({ type: "get_settings" }, 30_000)));
  ipcMain.handle("pi:update-settings", async (_event, patch: unknown) => {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Pi 设置更新无效");
    return rpcData<PiHostSettingsState>(await pi.send({ type: "update_settings", patch: patch as PiSettingsPatch }, 30_000));
  });
  ipcMain.handle("pi:get-project-trust", async () => rpcData<ProjectTrustState>(await pi.send({ type: "get_project_trust" }, 30_000)));
  ipcMain.handle("pi:set-project-trust", async (_event, decision: unknown, target: unknown) => {
    if (decision !== true && decision !== false && decision !== null) throw new Error("项目可信决定无效");
    if (target !== undefined && target !== "current" && target !== "parent") throw new Error("项目可信范围无效");
    return rpcData<ProjectTrustState>(await pi.send({ type: "set_project_trust", decision, target }, 60_000));
  });
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
  ipcMain.handle("workspace:search-files", (_event, query: unknown) => workspaceFiles.searchFiles(query));
  ipcMain.handle("workspace:read-file", (_event, path: unknown) => workspaceFiles.readFile(path));
  ipcMain.handle("workspace:save-file", (_event, request: unknown) => workspaceFiles.saveFile(request as WorkspaceFileSaveRequest));
  ipcMain.handle("workspace:revert-agent-change", (_event, change: unknown) => workspaceFiles.revertAgentChange(change as FileChange));
  ipcMain.handle("workspace:get-git-status", () => workspaceGit.getStatus());
  ipcMain.handle("workspace:get-git-diff", (_event, path: unknown, staged: unknown) => {
    if (typeof staged !== "boolean") throw new Error("Git Diff 参数无效");
    return workspaceGit.getDiff(path, staged);
  });
  ipcMain.handle("terminal:get-profiles", () => terminalService.getProfiles());
  ipcMain.handle("terminal:create", (event, request: unknown) => (
    terminalService.create(event.sender, request as TerminalCreateRequest)
  ));
  ipcMain.on("terminal:write", (event, id: unknown, data: unknown) => {
    try {
      terminalService.write(event.sender.id, id, data);
    } catch (error) {
      reportTerminalError(error);
    }
  });
  ipcMain.on("terminal:resize", (event, id: unknown, cols: unknown, rows: unknown) => {
    try {
      terminalService.resize(event.sender.id, id, cols, rows);
    } catch (error) {
      reportTerminalError(error);
    }
  });
  ipcMain.on("terminal:clear", (event, id: unknown) => {
    try {
      terminalService.clear(event.sender.id, id);
    } catch (error) {
      reportTerminalError(error);
    }
  });
  ipcMain.handle("terminal:kill", (event, id: unknown) => terminalService.kill(event.sender.id, id));
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
  workspaceGit = new WorkspaceGitService(() => pi.getStatus().cwd, workspaceFiles);
  fileChangeTracker = new FileChangeTracker(workspaceFiles);
  sessionService = new PiSessionService(pi, eventAdapter, (path) => shell.trashItem(path));
  resourceService = new PiResourceService(pi);
  providerService = new PiProviderService(pi);
  imageAttachments = new ImageAttachmentStore();
  terminalService = new TerminalService();
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
  terminalService?.disposeAll();
  void pi?.stop();
});
