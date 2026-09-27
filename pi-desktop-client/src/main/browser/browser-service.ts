import { BrowserWindow, WebContentsView, dialog, ipcMain, session } from "electron";
import { randomUUID } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { EMPTY_BROWSER_STATE, type BrowserBounds, type BrowserState } from "../../shared/contracts/browser";
import { browserTarget } from "./browser-target";

export const PREVIEW_SCHEME = "pi-preview";
const mime: Record<string, string> = { ".html": "text/html", ".htm": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4", ".wasm": "application/wasm" };

export class BrowserService {
  private view?: WebContentsView;
  private state: BrowserState = { ...EMPTY_BROWSER_STATE };
  private roots = new Map<string, string>();
  private disposed = false;
  private navigation = 0;
  private readonly browserSession = session.fromPartition(`preview-${randomUUID()}`);

  constructor(private owner: BrowserWindow, private cwd: () => string) {
    this.browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    this.browserSession.setPermissionCheckHandler(() => false);
    this.browserSession.on("will-download", event => { event.preventDefault(); this.state.error = "请在系统浏览器中下载文件"; this.publish(); });
    this.browserSession.webRequest.onBeforeRequest({ urls: ["file://*/*"] }, (_details, callback) => callback({ cancel: true }));
    this.browserSession.protocol.handle(PREVIEW_SCHEME, request => this.serveLocal(request));
    owner.once("closed", () => this.dispose());
    owner.webContents.on("did-start-loading", () => this.setBounds(null));
  }

  private async serveLocal(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const root = this.roots.get(url.hostname);
      if (!root || !["GET", "HEAD"].includes(request.method)) return new Response("Not found", { status: 404 });
      const target = await realpath(resolve(root, `.${decodeURIComponent(url.pathname)}`));
      const path = relative(root, target);
      const type = mime[extname(target).toLowerCase()];
      if (!path || isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`) || resolve(root, path) !== target || !type) return new Response("Forbidden", { status: 403 });
      const info = await stat(target);
      if (!info.isFile() || info.size > 50 * 1024 * 1024) return new Response("File too large", { status: 413 });
      return new Response(request.method === "HEAD" ? null : new Uint8Array(await readFile(target)), { headers: { "content-type": type.startsWith("text/") || type === "application/json" ? `${type}; charset=utf-8` : type, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    } catch { return new Response("Not found", { status: 404 }); }
  }

  private allowed(url: string): boolean {
    try { const target = new URL(url); return ["http:", "https:"].includes(target.protocol) || (target.protocol === `${PREVIEW_SCHEME}:` && this.roots.has(target.hostname)); } catch { return false; }
  }

  private ensureView(): WebContentsView {
    if (this.disposed) throw new Error("浏览器已关闭");
    if (this.view) return this.view;
    const view = new WebContentsView({ webPreferences: { session: this.browserSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false } });
    this.view = view;
    view.setVisible(false);
    this.owner.contentView.addChildView(view);
    const contents = view.webContents;
    contents.on("will-navigate", (event, url) => { if (!this.allowed(url)) event.preventDefault(); });
    contents.on("will-redirect", (event, url) => { if (!this.allowed(url)) event.preventDefault(); });
    contents.setWindowOpenHandler(({ url }) => { if (this.allowed(url)) void this.load(url); return { action: "deny" }; });
    contents.on("did-start-loading", () => { this.state.error = undefined; this.publish(); });
    contents.on("did-stop-loading", () => this.publish());
    contents.on("did-navigate", () => this.publish());
    contents.on("did-navigate-in-page", () => this.publish());
    contents.on("page-title-updated", () => this.publish());
    contents.on("did-fail-load", (_event, code, description, _url, mainFrame) => { if (mainFrame && code !== -3) { this.state.error = `网页加载失败：${description}`; this.publish(); } });
    contents.on("render-process-gone", () => { this.state.error = "页面进程已退出，请刷新重试"; this.publish(); });
    return view;
  }

  snapshot(): BrowserState { return { ...this.state }; }

  private publish(): void {
    const contents = this.view?.webContents;
    if (this.disposed || this.owner.isDestroyed()) return;
    if (contents && !contents.isDestroyed()) {
      let url = contents.getURL();
      if (url.startsWith(`${PREVIEW_SCHEME}:`)) {
        const parsed = new URL(url); const root = this.roots.get(parsed.hostname);
        if (root) url = pathToFileURL(resolve(root, `.${decodeURIComponent(parsed.pathname)}`)).href;
      }
      this.state = { ...this.state, url, title: contents.getTitle() || "浏览器", loading: contents.isLoading(), canGoBack: contents.navigationHistory.canGoBack(), canGoForward: contents.navigationHistory.canGoForward() };
    }
    this.owner.webContents.send("browser:state", this.snapshot());
  }

  private async load(url: string): Promise<void> {
    try { await this.ensureView().webContents.loadURL(url); } catch (error) {
      if (!this.disposed && !(error instanceof Error && error.message.includes("ERR_ABORTED"))) { this.state.error = String(error); this.publish(); }
    }
  }

  async navigate(input: unknown): Promise<void> {
    const sequence = ++this.navigation;
    const target = browserTarget(input, this.cwd());
    let url = target.value;
    if (target.kind === "file") {
      const file = await realpath(target.value);
      if (!(await stat(file)).isFile()) throw new Error("请选择 HTML 文件");
      const root = dirname(file); const id = randomUUID(); this.roots.set(id, root);
      url = `${PREVIEW_SCHEME}://${id}/${encodeURIComponent(basename(file))}`;
    }
    if (sequence === this.navigation && !this.disposed) void this.load(url);
  }

  setBounds(bounds: BrowserBounds | null): void {
    if (this.disposed) return;
    if (!bounds) { this.view?.setVisible(false); return; }
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) throw new Error("无效浏览器尺寸");
    const [width, height] = this.owner.getContentSize();
    const x = Math.max(0, Math.min(width, Math.round(bounds.x))); const y = Math.max(0, Math.min(height, Math.round(bounds.y)));
    const rect = { x, y, width: Math.max(0, Math.min(width - x, Math.round(bounds.width))), height: Math.max(0, Math.min(height - y, Math.round(bounds.height))) };
    const view = this.ensureView(); view.setBounds(rect); view.setVisible(rect.width > 0 && rect.height > 0);
  }

  async action(action: unknown): Promise<void> {
    if (action === "pick-file") {
      const result = await dialog.showOpenDialog(this.owner, { properties: ["openFile"], filters: [{ name: "HTML 网页", extensions: ["html", "htm"] }] });
      if (!result.canceled && result.filePaths[0]) await this.navigate(result.filePaths[0]);
      return;
    }
    const contents = this.view?.webContents; if (!contents) return;
    if (action === "back" && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    else if (action === "forward" && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
    else if (action === "reload") contents.reload();
    else if (action === "stop") contents.stop();
  }

  dispose(): void {
    this.disposed = true;
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close();
    this.roots.clear();
    this.browserSession.protocol.unhandle(PREVIEW_SCHEME);
  }
}

export function registerBrowserIpc(getOwner: () => BrowserWindow | null, cwd: () => string): void {
  const services = new WeakMap<BrowserWindow, BrowserService>();
  const service = (event: Electron.IpcMainInvokeEvent) => {
    const owner = getOwner();
    if (!owner || event.sender !== owner.webContents || event.senderFrame !== owner.webContents.mainFrame) throw new Error("无效浏览器请求");
    let current = services.get(owner); if (!current) { current = new BrowserService(owner, cwd); services.set(owner, current); }
    return current;
  };
  ipcMain.handle("browser:get-state", event => service(event).snapshot());
  ipcMain.handle("browser:navigate", (event, input: unknown) => service(event).navigate(input));
  ipcMain.handle("browser:bounds", (event, bounds: BrowserBounds | null) => service(event).setBounds(bounds));
  ipcMain.handle("browser:action", (event, action: unknown) => service(event).action(action));
}
