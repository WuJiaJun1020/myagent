import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type CdpParams = Record<string, unknown>;
type CdpListener = (params: CdpParams) => void;

type CdpMessage = {
  id?: number;
  method?: string;
  params?: CdpParams;
  result?: unknown;
  error?: { code?: number; message?: string };
};

type PendingCommand = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

const EDGE_START_TIMEOUT_MS = 20_000;
const CDP_COMMAND_TIMEOUT_MS = 60_000;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findEdgeExecutable(): Promise<string> {
  const candidates = [
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next standard Edge installation path.
    }
  }
  throw new Error("未找到 Microsoft Edge。字节岗位采集需要系统 Edge 来生成官网动态签名。");
}

class CdpClient {
  private nextId = 1;
  private readonly pending = new Map<number, PendingCommand>();
  private readonly listeners = new Map<string, Set<CdpListener>>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => this.handleMessage(event));
    socket.addEventListener("close", () => this.rejectPending(new Error("Edge 调试连接已关闭。")));
    socket.addEventListener("error", () => this.rejectPending(new Error("Edge 调试连接发生错误。")));
  }

  static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("连接 Edge 调试端口超时。")), 10_000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("无法连接 Edge 调试端口。"));
      }, { once: true });
    });
    return new CdpClient(socket);
  }

  call<T = unknown>(method: string, params: CdpParams = {}): Promise<T> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Edge 命令超时：${method}`));
      }, CDP_COMMAND_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  on(method: string, listener: CdpListener): () => void {
    const group = this.listeners.get(method) ?? new Set<CdpListener>();
    group.add(listener);
    this.listeners.set(method, group);
    return () => {
      group.delete(listener);
      if (group.size === 0) this.listeners.delete(method);
    };
  }

  waitFor(method: string, timeoutMs = CDP_COMMAND_TIMEOUT_MS): Promise<CdpParams> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`等待 Edge 事件超时：${method}`));
      }, timeoutMs);
      const unsubscribe = this.on(method, (params) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(params);
      });
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.call<{
      result?: { value?: T; description?: string };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    }>("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      const detail = response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? "页面脚本执行失败";
      throw new Error(detail);
    }
    return response.result?.value as T;
  }

  close(): void {
    this.socket.close();
    this.rejectPending(new Error("Edge 调试会话已结束。"));
  }

  private handleMessage(event: MessageEvent): void {
    let message: CdpMessage;
    try {
      message = JSON.parse(String(event.data)) as CdpMessage;
    } catch {
      return;
    }
    if (typeof message.id === "number") {
      const command = this.pending.get(message.id);
      if (!command) return;
      clearTimeout(command.timer);
      this.pending.delete(message.id);
      if (message.error) command.reject(new Error(message.error.message ?? "Edge 命令失败。"));
      else command.resolve(message.result);
      return;
    }
    if (!message.method) return;
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
  }

  private rejectPending(error: Error): void {
    for (const command of this.pending.values()) {
      clearTimeout(command.timer);
      command.reject(error);
    }
    this.pending.clear();
  }
}

async function waitForDevToolsPort(profileDirectory: string, process: ChildProcess): Promise<number> {
  const portFile = join(profileDirectory, "DevToolsActivePort");
  const deadline = Date.now() + EDGE_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // Edge's small launcher process may exit with code 0 after handing the
    // temporary profile to the actual browser process. The port file remains
    // the authoritative readiness signal.
    if (process.exitCode !== null && process.exitCode !== 0) {
      throw new Error(`Edge 启动失败，退出码 ${process.exitCode}。`);
    }
    try {
      const [portText] = (await readFile(portFile, "utf8")).split(/\r?\n/u);
      const port = Number(portText);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // Edge writes DevToolsActivePort after its temporary profile is ready.
    }
    await wait(100);
  }
  throw new Error("等待 Edge 启动超时。");
}

async function findPageTarget(port: number): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json() as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // The local debugging endpoint may need another moment to start.
    }
    await wait(100);
  }
  throw new Error("未找到 Edge 页面调试目标。");
}

export class EdgeCdpSession {
  private disposed = false;

  private constructor(
    private readonly client: CdpClient,
    private readonly process: ChildProcess,
    private readonly profileDirectory: string,
  ) {}

  static async launch(): Promise<EdgeCdpSession> {
    const executable = await findEdgeExecutable();
    const profileDirectory = await mkdtemp(join(tmpdir(), "pi-job-collector-"));
    const edgeProcess = spawn(executable, [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=msEdgeFirstRunExperience",
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      `--user-data-dir=${profileDirectory}`,
      "about:blank",
    ], {
      stdio: "ignore",
      windowsHide: true,
    });

    try {
      const port = await waitForDevToolsPort(profileDirectory, edgeProcess);
      const target = await findPageTarget(port);
      const client = await CdpClient.connect(target);
      await Promise.all([
        client.call("Page.enable"),
        client.call("Runtime.enable"),
        client.call("Network.enable"),
      ]);
      await client.call("Network.setUserAgentOverride", {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        acceptLanguage: "zh-CN,zh;q=0.9",
        platform: "Windows",
      });
      return new EdgeCdpSession(client, edgeProcess, profileDirectory);
    } catch (error) {
      edgeProcess.kill();
      await rm(profileDirectory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  call<T = unknown>(method: string, params: CdpParams = {}): Promise<T> {
    return this.client.call<T>(method, params);
  }

  evaluate<T>(expression: string): Promise<T> {
    return this.client.evaluate<T>(expression);
  }

  on(method: string, listener: CdpListener): () => void {
    return this.client.on(method, listener);
  }

  waitFor(method: string, timeoutMs?: number): Promise<CdpParams> {
    return this.client.waitFor(method, timeoutMs);
  }

  terminate(): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.client.call("Browser.close").catch(() => undefined);
    this.client.close();
    this.process.kill();
    void rm(this.profileDirectory, { recursive: true, force: true }).catch(() => undefined);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.client.call("Browser.close").catch(() => undefined);
    this.client.close();
    this.process.kill();
    await wait(200);
    await rm(this.profileDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
