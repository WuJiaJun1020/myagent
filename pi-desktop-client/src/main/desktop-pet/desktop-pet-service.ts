import { BrowserWindow, ipcMain, screen, type IpcMainInvokeEvent } from "electron";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { existsSync, realpathSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { PET_ACTIONS, parsePetPatch, type PetAnimation, type PetManifest, type PetSettings, type PetSnapshot, type PetPlayback } from "../../shared/contracts/desktop-pet";
import { clampPetPosition, validDesktopPoint } from "./pet-window-geometry";

type Options = { dataDirectory: string; resourceDirectory: string; preloadFile: string; getMainWindow: () => BrowserWindow | null; getCursorPosition?: () => { x: number; y: number } };
export class DesktopPetService {
  private manifest!: PetManifest;
  private settings: PetSettings = { enabled: false, action: "reading", scales: { reading: .2, chess: 1, bamboo: .2 }, position: null };
  private window: BrowserWindow | null = null;
  private revision = 0;
  private disposed = false;
  private queue: Promise<unknown> = Promise.resolve();
  private dragOrigin: { x: number; y: number; cursor: { x: number; y: number }; moved: boolean } | null = null;
  private mousePoint: { x: number; y: number } | null = null;
  private readonly channels = ["pet:get-state", "pet:configure", "pet:get-playback", "pet:drag-start", "pet:drag-move", "pet:drag-end", "pet:interactive"];
  constructor(private readonly options: Options) {}
  private asset(file: string): string {
    if (!/^(reading|chess|bamboo)\/(?:\d{2,4}|poster)\.png$/.test(file)) throw new Error("桌宠素材路径无效");
    const root = realpathSync(this.options.resourceDirectory), target = realpathSync(resolve(root, file));
    if (!target.toLowerCase().startsWith(`${root.toLowerCase()}${sep}`)) throw new Error("桌宠素材超出资源目录");
    return target;
  }
  async initialize(): Promise<void> {
    const input = JSON.parse(await readFile(join(this.options.resourceDirectory, "manifest.json"), "utf8")) as PetManifest;
    if (input.version !== 1 || input.actions?.length !== 3 || new Set(input.actions.map(a => a.id)).size !== 3) throw new Error("桌宠动画清单无效");
    for (const action of input.actions) {
      if (!PET_ACTIONS.includes(action.id) || typeof action.title !== "string" || typeof action.loop !== "boolean" || ![action.width, action.height, action.displayWidth, action.displayHeight].every(v => Number.isInteger(v) && v > 0 && v <= 8192) || !Array.isArray(action.frames) || !action.frames.length || action.frames.length > 2000) throw new Error("桌宠动画参数无效");
      action.contentBounds ??= { x: 0, y: 0, width: action.width, height: action.height };
      const b=action.contentBounds;
      if(![b.x,b.y,b.width,b.height].every(Number.isInteger)||b.x<0||b.y<0||b.width<1||b.height<1||b.x+b.width>action.width||b.y+b.height>action.height)throw new Error("桌宠有效范围无效");
      if (action.poster !== `${action.id}/poster.png`) throw new Error("桌宠预览无效");this.asset(action.poster);
      for (const frame of action.frames) { if (!frame.file.startsWith(`${action.id}/`) || !Number.isFinite(frame.durationMs) || frame.durationMs < 10 || frame.durationMs > 60000) throw new Error("桌宠帧无效");this.asset(frame.file); }
    }
    this.manifest = input;
    const config = join(this.options.dataDirectory, "settings.json");
    if (existsSync(config)) try {
      const saved = JSON.parse(await readFile(config, "utf8"));
      this.settings = { ...this.settings, ...parsePetPatch({ enabled: saved.enabled, action: saved.action }) };
      for (const action of this.manifest.actions) {
        // Old scale was relative to a 256 px preview; convert it to source pixels.
        const migrated = typeof saved.scale === "number" ? saved.scale * action.displayWidth / action.width : this.settings.scales[action.id];
        const scale = saved.scales?.[action.id] ?? Math.max(.01, Math.min(1, migrated));
        this.settings.scales[action.id] = parsePetPatch({ scale }).scale!;
      }
      if (saved.position && [saved.position.x, saved.position.y].every((v: unknown) => typeof v === "number" && Number.isFinite(v))) this.settings.position = { x: Math.round(saved.position.x), y: Math.round(saved.position.y) };
    } catch (error) { console.warn("桌宠设置无效，使用默认值", error); }
    this.register();if (this.settings.enabled) await this.applyWindow();
  }
  snapshot(): PetSnapshot {
    return { settings: structuredClone(this.settings), actions: this.manifest.actions.map(({ frames, poster, ...a }) => ({ ...a, frameCount: frames.length, durationMs: frames.reduce((n,f) => n+f.durationMs, 0), posterUrl: `data:image/png;base64,${readFileSync(this.asset(poster)).toString("base64")}` })) };
  }
  private animation(): PetAnimation { return this.manifest.actions.find(a => a.id === this.settings.action)!; }
  playback(): PetPlayback { const animation = this.animation();return { settings: structuredClone(this.settings), animation: { ...animation, frames: animation.frames.map(f => ({ ...f, url: pathToFileURL(this.asset(f.file)).href })) }, revision: this.revision }; }
  private authorized(event: IpcMainInvokeEvent, petOnly = false): void {
    const pet = this.window && event.sender === this.window.webContents, main = this.options.getMainWindow();
    if (!pet && (petOnly || !main || event.sender !== main.webContents)) throw new Error("桌宠窗口来源无效");
  }
  private publish(): void {
    const main = this.options.getMainWindow();if (main && !main.isDestroyed()) main.webContents.send("pet:state-changed", this.snapshot());
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send("pet:playback-changed", this.playback());
  }
  private async persist(): Promise<void> {
    await mkdir(this.options.dataDirectory, { recursive: true });const file = join(this.options.dataDirectory, "settings.json"), temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(this.settings, null, 2), "utf8");await rename(temporary, file);
  }
  async configure(input: unknown): Promise<PetSnapshot> {
    const patch = parsePetPatch(input);
    const operation = this.queue.then(async () => {
      if (this.disposed) throw new Error("桌宠已关闭");
      const before = structuredClone(this.settings);
      this.settings = { ...this.settings, enabled: patch.enabled ?? before.enabled, action: patch.action ?? before.action, scales: { ...before.scales } };
      if (patch.scale !== undefined) this.settings.scales[this.settings.action] = patch.scale;
      if(this.window && (patch.action !== undefined || patch.scale !== undefined)) {
        const old=this.window.getBounds(),size=this.boundsSize();this.settings.position=this.clampPosition({x:old.x+(old.width-size.width)/2,y:old.y+old.height-size.height},size);
      }
      try { await this.applyWindow();await this.persist(); } catch(error) { this.settings = before;await this.persist();throw error; }
      if (patch.action !== undefined || (patch.enabled === true && !before.enabled)) this.revision++;
      this.publish();return this.snapshot();
    });this.queue = operation.catch(() => undefined);return operation;
  }
  private boundsSize(): { width: number; height: number } { const a = this.animation(), scale = this.settings.scales[a.id];return { width: Math.max(240, Math.round(a.contentBounds.width*scale)+16), height: Math.max(96, Math.round(a.contentBounds.height*scale)+16+36) }; }
  private clampPosition(position: { x: number; y: number }, size = this.boundsSize(), cursor?: {x:number;y:number}): { x: number; y: number } {
    const area = (cursor ? screen.getDisplayNearestPoint(cursor) : screen.getDisplayMatching({ ...position, ...size })).workArea;
    const a=this.animation(),scale=this.settings.scales[a.id],width=Math.max(1,Math.round(a.contentBounds.width*scale)),height=Math.max(1,Math.round(a.contentBounds.height*scale));
    return clampPetPosition(position,{x:(size.width-width)/2,y:size.height-height-36,width,height},area);
  }
  private async applyWindow(): Promise<void> {
    this.dragOrigin = null;
    if (!this.settings.enabled) { if(this.window){this.window.destroy();this.window=null;}return; }
    const size = this.boundsSize(), area = screen.getPrimaryDisplay().workArea;
    this.settings.position = this.clampPosition(this.settings.position || { x: area.x+area.width-size.width-24, y: area.y+area.height-size.height-16 }, size);
    if (!this.window) {
      const win = new BrowserWindow({ ...size, ...this.settings.position, title: "韩立 · 桌宠", transparent: true, backgroundColor: "#00000000", frame: false, resizable: false, maximizable: false, fullscreenable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false, webPreferences: { preload: this.options.preloadFile, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
      this.window = win;win.setIgnoreMouseEvents(true,{ forward: true });win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("before-mouse-event",(_event,mouse)=>{
        if(mouse.type!=="mouseMove"&&mouse.type!=="mouseDown"&&mouse.type!=="mouseUp")return;
        const displays=screen.getAllDisplays().map(d=>d.bounds),global={x:mouse.globalX!,y:mouse.globalY!},bounds=win.getContentBounds();
        const point=validDesktopPoint(global,displays)?global:{x:bounds.x+mouse.x,y:bounds.y+mouse.y};
        if(validDesktopPoint(point,displays))this.mousePoint=point;
        if(mouse.type==="mouseMove"&&this.dragOrigin)this.moveDrag();
        if(mouse.type==="mouseUp"&&mouse.button==="left")void this.endDrag().catch(console.error);
      });
      win.webContents.on("will-navigate",event=>event.preventDefault());
      win.on("closed",()=>{if(this.window===win){this.window=null;if(!this.disposed&&this.settings.enabled)void this.configure({enabled:false}).catch(console.error);}});
      await win.loadFile(join(this.options.resourceDirectory,"pet.html"));win.showInactive();
    } else this.window.setBounds({ ...size, ...this.settings.position });
  }
  private register(): void {
    ipcMain.handle("pet:get-state",event=>{this.authorized(event);return this.snapshot();});
    ipcMain.handle("pet:configure",(event,patch:unknown)=>{this.authorized(event);return this.configure(patch);});
    ipcMain.handle("pet:get-playback",event=>{this.authorized(event,true);return this.playback();});
    ipcMain.handle("pet:interactive",(event,value:unknown)=>{this.authorized(event,true);if(typeof value!=="boolean")throw Error("桌宠鼠标状态无效");if(!this.dragOrigin)this.window?.setIgnoreMouseEvents(!value,{forward:true});});
    ipcMain.handle("pet:drag-start",event=>{this.authorized(event,true);const cursor=this.cursorPosition();if(!cursor)throw Error("暂时无法读取鼠标位置，请重新拖动");const [x,y]=this.window!.getPosition();this.dragOrigin={x,y,cursor,moved:false};this.window!.setIgnoreMouseEvents(false);});
    ipcMain.handle("pet:drag-move",event=>{this.authorized(event,true);return this.moveDrag();});
    ipcMain.handle("pet:drag-end",async event=>{this.authorized(event,true);await this.endDrag();});
  }
  private moveDrag(): boolean {
    const origin=this.dragOrigin,win=this.window;if(!origin||!win)return false;
    const cursor=this.cursorPosition();if(!cursor)return false;
    const dx=cursor.x-origin.cursor.x,dy=cursor.y-origin.cursor.y;
    if(!origin.moved&&Math.hypot(dx,dy)<4)return false;
    origin.moved=true;
    const size=this.boundsSize(),position=this.clampPosition({x:origin.x+dx,y:origin.y+dy},size,cursor);
    const bounds=win.getBounds();
    // Reapply the intended dimensions: repeated setPosition calls on scaled Windows
    // displays can round the window size upward and displace the centered sprite.
    if(Math.abs(bounds.x-position.x)>1||Math.abs(bounds.y-position.y)>1||Math.abs(bounds.width-size.width)>1||Math.abs(bounds.height-size.height)>1)win.setBounds({...size,...position});
    const[x,y]=win.getPosition();this.settings.position={x,y};return true;
  }
  private async endDrag(): Promise<void> {
    const moved=this.dragOrigin?.moved;if(!this.dragOrigin)return;this.dragOrigin=null;
    this.window?.webContents.send("pet:drag-ended");
    if(moved){await this.queue;await this.persist();this.publish();}
  }
  private cursorPosition(): { x: number; y: number } | null {
    const displays=screen.getAllDisplays().map(d=>d.bounds);
    if(this.options.getCursorPosition){const point=this.options.getCursorPosition();return validDesktopPoint(point,displays)?point:null;}
    const native=screen.getCursorScreenPoint();
    if(validDesktopPoint(native,displays))return native;
    return this.mousePoint&&validDesktopPoint(this.mousePoint,displays)?this.mousePoint:null;
  }
  dispose(): void { this.disposed=true;for(const channel of this.channels)ipcMain.removeHandler(channel);this.window?.destroy();this.window=null; }
}
