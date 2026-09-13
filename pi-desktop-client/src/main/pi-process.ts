import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { ProcessStatus, RpcCommand, RpcMessage } from "../shared/rpc";
import { JsonlDecoder } from "./jsonl";

type PendingRequest = {
  resolve: (message: RpcMessage) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class PiProcess extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, PendingRequest>();
  private expectedExits = new WeakSet<ChildProcessWithoutNullStreams>();
  private sequence = 0;
  private status: ProcessStatus;
  private sessionDir: string | undefined;

  constructor(private cwd: string, private readonly appRoot: string) {
    super();
    this.status = { state: "stopped", cwd };
  }

  getStatus(): ProcessStatus {
    return { ...this.status };
  }

  /** Synchronize the desktop workspace after Pi switches an existing session in-process. */
  setWorkspaceCwd(cwd: string): void {
    if (!cwd || this.cwd === cwd) return;
    this.cwd = cwd;
    this.setStatus({ ...this.status, cwd });
  }

  async start(): Promise<void> {
    if (this.child) return;
    this.setStatus({ state: "starting", cwd: this.cwd });

    const launch = this.resolvePiLaunch();
    const child = spawn(launch.executable, launch.args, {
      cwd: this.cwd,
      env: launch.env,
      shell: launch.shell,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;

    const decoder = new JsonlDecoder();
    child.stdout.on("data", (chunk: Buffer) => {
      for (const record of decoder.push(chunk)) this.handleRecord(record);
    });
    child.stdout.on("end", () => {
      for (const record of decoder.finish()) this.handleRecord(record);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      this.emit("diagnostic", chunk.toString("utf8"));
    });
    child.once("exit", (code, signal) => {
      if (this.child === child) this.child = null;
      const detail = `Pi 已退出（code=${code ?? "null"}, signal=${signal ?? "null"}）`;
      this.rejectPending(new Error(detail));
      const expected = this.expectedExits.delete(child);
      this.setStatus(expected || code === 0
        ? { state: "stopped", cwd: this.cwd }
        : { state: "error", cwd: this.cwd, detail });
    });

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", () => {
        this.setStatus({ state: "running", cwd: this.cwd });
        resolve();
      });
      child.once("error", (error) => {
        if (this.child === child) this.child = null;
        this.rejectPending(error);
        this.setStatus({ state: "error", cwd: this.cwd, detail: error.message });
        reject(error);
      });
    });
  }

  async restart(cwd = this.cwd, sessionDir?: string): Promise<void> {
    await this.stop();
    this.cwd = cwd;
    this.sessionDir = sessionDir;
    await this.start();
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = null;
    this.expectedExits.add(child);
    this.rejectPending(new Error("Pi 进程已停止"));
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      if (!child.kill()) {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  send(command: RpcCommand, timeoutMs = 15_000): Promise<RpcMessage> {
    if (!this.child || this.child.stdin.destroyed) {
      return Promise.reject(new Error("Pi 尚未运行"));
    }

    const id = command.id ?? `desktop-${Date.now()}-${++this.sequence}`;
    const payload = { ...command, id };

    return new Promise<RpcMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`等待 Pi 响应超时：${command.type}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child?.stdin.write(`${JSON.stringify(payload)}\n`, "utf8", (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  sendWithoutResponse(command: RpcCommand): void {
    if (!this.child || this.child.stdin.destroyed) throw new Error("Pi 尚未运行");
    this.child.stdin.write(`${JSON.stringify(command)}\n`, "utf8");
  }

  private resolvePiLaunch(): {
    executable: string;
    args: string[];
    env: NodeJS.ProcessEnv;
    shell: boolean;
  } {
    const sessionEnv = this.sessionDir
      ? { PI_CODING_AGENT_SESSION_DIR: this.sessionDir }
      : {};
    const bundledRpcEntry = join(
      this.appRoot,
      "node_modules",
      "@earendil-works",
      "pi-coding-agent",
      "dist",
      "bundle",
      "rpc-entry.js",
    );

    if (existsSync(bundledRpcEntry)) {
      return {
        executable: process.execPath,
        args: [bundledRpcEntry],
        env: process.versions.electron
          ? { ...process.env, ...sessionEnv, ELECTRON_RUN_AS_NODE: "1" }
          : { ...process.env, ...sessionEnv },
        shell: false,
      };
    }

    return {
      executable: process.platform === "win32" ? "pi.cmd" : "pi",
      args: ["--mode", "rpc"],
      env: { ...process.env, ...sessionEnv },
      shell: process.platform === "win32",
    };
  }

  private handleRecord(record: string): void {
    let message: RpcMessage;
    try {
      message = JSON.parse(record) as RpcMessage;
    } catch (error) {
      this.emit("diagnostic", `无法解析 Pi 输出：${String(error)}\n${record}`);
      return;
    }

    if (message.type === "response" && message.id) {
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.success === false) pending.reject(new Error(message.error ?? "Pi 命令失败"));
        else pending.resolve(message);
      }
      return;
    }
    this.emit("event", message);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private setStatus(status: ProcessStatus): void {
    this.status = status;
    this.emit("status", status);
  }
}
