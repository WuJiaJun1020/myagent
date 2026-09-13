import type { WebContents } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, join } from "node:path";
import { randomUUID } from "node:crypto";
import * as pty from "node-pty";
import type {
  TerminalCreateRequest,
  TerminalProfile,
  TerminalSession,
} from "../../shared/contracts/terminal";
import { resolveTerminalDirectory } from "./terminal-directory";

type ResolvedTerminalProfile = TerminalProfile & {
  executable: string;
  args: string[];
};

type ManagedTerminal = {
  process: pty.IPty;
  ownerId: number;
};

function executableInPath(name: string): string | undefined {
  const path = process.env.Path ?? process.env.PATH ?? "";
  for (const directory of path.split(delimiter)) {
    const candidate = join(directory.replace(/^"|"$/g, ""), name);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function configuredPiShell(): string | undefined {
  try {
    const value = JSON.parse(readFileSync(join(homedir(), ".pi", "agent", "settings.json"), "utf8")) as {
      shellPath?: unknown;
    };
    return typeof value.shellPath === "string" && existsSync(value.shellPath) ? value.shellPath : undefined;
  } catch {
    return undefined;
  }
}

function profileName(executable: string): string {
  const name = basename(executable).toLowerCase();
  if (name === "pwsh.exe" || name === "pwsh") return "PowerShell";
  if (name === "powershell.exe") return "Windows PowerShell";
  if (name === "cmd.exe") return "Command Prompt";
  if (name.includes("bash")) return "Git Bash";
  if (name.includes("zsh")) return "Zsh";
  return basename(executable);
}

function profileArgs(executable: string): string[] {
  const name = basename(executable).toLowerCase();
  if (name === "pwsh.exe" || name === "pwsh" || name === "powershell.exe") return ["-NoLogo"];
  if (name.includes("bash")) return ["--login", "-i"];
  return [];
}

export function detectTerminalProfiles(): ResolvedTerminalProfile[] {
  const candidates: string[] = [];
  const configured = configuredPiShell();
  if (configured) candidates.push(configured);

  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    candidates.push(
      executableInPath("pwsh.exe") ?? "",
      join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      join(programFiles, "Git", "bin", "bash.exe"),
      process.env.ComSpec ?? join(systemRoot, "System32", "cmd.exe"),
    );
  } else {
    candidates.push(process.env.SHELL ?? "", executableInPath("bash") ?? "", executableInPath("zsh") ?? "");
  }

  const seen = new Set<string>();
  const profiles: ResolvedTerminalProfile[] = [];
  for (const executable of candidates) {
    if (!executable || !existsSync(executable)) continue;
    const key = process.platform === "win32" ? executable.toLowerCase() : executable;
    if (seen.has(key)) continue;
    seen.add(key);
    profiles.push({
      id: `shell-${profiles.length + 1}`,
      name: profileName(executable),
      executable,
      args: profileArgs(executable),
    });
  }
  return profiles;
}

function dimensions(cols: unknown, rows: unknown): { cols: number; rows: number } {
  if (typeof cols !== "number" || typeof rows !== "number" || !Number.isFinite(cols) || !Number.isFinite(rows)) {
    throw new Error("终端尺寸无效");
  }
  return {
    cols: Math.max(2, Math.min(500, Math.floor(cols))),
    rows: Math.max(1, Math.min(200, Math.floor(rows))),
  };
}

function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9-]{36}$/i.test(value)) throw new Error("终端 ID 无效");
  return value;
}

export class TerminalService {
  private readonly terminals = new Map<string, ManagedTerminal>();

  getProfiles(): TerminalProfile[] {
    return detectTerminalProfiles().map(({ id, name }) => ({ id, name }));
  }

  async create(owner: WebContents, request: TerminalCreateRequest): Promise<TerminalSession> {
    if (!request || typeof request !== "object") throw new Error("终端启动参数无效");
    const profiles = detectTerminalProfiles();
    const profile = request.profileId
      ? profiles.find((item) => item.id === request.profileId)
      : profiles[0];
    if (!profile) throw new Error("没有检测到可用的 PowerShell、CMD、Bash 或 Zsh");
    const cwd = await resolveTerminalDirectory(request.cwd, ".");
    const size = dimensions(request.cols, request.rows);
    const id = randomUUID();
    const environment = {
      ...process.env,
      TERM_PROGRAM: "pi-desktop",
      COLORTERM: "truecolor",
      CHERE_INVOKING: "1",
    };
    const terminalProcess = pty.spawn(profile.executable, profile.args, {
      name: "xterm-256color",
      cols: size.cols,
      rows: size.rows,
      cwd,
      env: environment,
      ...(process.platform === "win32" ? { useConpty: true } : {}),
    });
    this.terminals.set(id, { process: terminalProcess, ownerId: owner.id });

    terminalProcess.onData((data) => {
      if (!owner.isDestroyed()) owner.send("terminal:data", { id, data });
    });
    terminalProcess.onExit(({ exitCode, signal }) => {
      this.terminals.delete(id);
      if (!owner.isDestroyed()) owner.send("terminal:exit", { id, exitCode, signal });
    });

    return { id, pid: terminalProcess.pid, cwd, profile: { id: profile.id, name: profile.name } };
  }

  write(ownerId: number, idValue: unknown, dataValue: unknown): void {
    const terminal = this.ownedTerminal(ownerId, idValue);
    if (typeof dataValue !== "string" || dataValue.length > 1_000_000) throw new Error("终端输入无效");
    terminal.process.write(dataValue);
  }

  resize(ownerId: number, idValue: unknown, cols: unknown, rows: unknown): void {
    const terminal = this.ownedTerminal(ownerId, idValue);
    const size = dimensions(cols, rows);
    terminal.process.resize(size.cols, size.rows);
  }

  clear(ownerId: number, idValue: unknown): void {
    this.ownedTerminal(ownerId, idValue).process.clear();
  }

  kill(ownerId: number, idValue: unknown): void {
    const id = safeId(idValue);
    const terminal = this.terminals.get(id);
    if (!terminal) return;
    if (terminal.ownerId !== ownerId) throw new Error("无权访问此终端");
    this.terminals.delete(id);
    try {
      terminal.process.kill();
    } catch {
      // The process may have exited between lookup and disposal.
    }
  }

  disposeOwner(ownerId: number): void {
    for (const [id, terminal] of this.terminals) {
      if (terminal.ownerId !== ownerId) continue;
      this.terminals.delete(id);
      try {
        terminal.process.kill();
      } catch {
        // The process may already be gone while its exit event is in flight.
      }
    }
  }

  disposeAll(): void {
    for (const terminal of this.terminals.values()) {
      try {
        terminal.process.kill();
      } catch {
        // Best-effort shutdown during app exit.
      }
    }
    this.terminals.clear();
  }

  private ownedTerminal(ownerId: number, idValue: unknown): ManagedTerminal {
    const terminal = this.terminals.get(safeId(idValue));
    if (!terminal) throw new Error("终端会话不存在或已经结束");
    if (terminal.ownerId !== ownerId) throw new Error("无权访问此终端");
    return terminal;
  }
}
