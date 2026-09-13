import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { WorkspaceGitDiff, WorkspaceGitFile, WorkspaceGitStatus } from "../../shared/contracts/workspace";
import { WorkspaceFileService } from "./workspace-files";

const MAX_GIT_OUTPUT_LENGTH = 400_000;

type GitResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function isContained(parent: string, child: string): boolean {
  const value = relative(parent, child);
  return value === "" || (!value.startsWith(`..${sep}`) && value !== ".." && !isAbsolute(value));
}

function parseBranch(value: string): Pick<WorkspaceGitStatus, "branch" | "ahead" | "behind"> {
  const branch = value.replace(/^##\s*/, "").split("...")[0]?.trim();
  const ahead = Number(value.match(/ahead (\d+)/)?.[1] ?? "0");
  const behind = Number(value.match(/behind (\d+)/)?.[1] ?? "0");
  return {
    ...(branch && branch !== "HEAD (no branch)" ? { branch } : {}),
    ...(ahead > 0 ? { ahead } : {}),
    ...(behind > 0 ? { behind } : {}),
  };
}

function parseStatus(value: string): Omit<WorkspaceGitStatus, "available" | "error"> {
  const entries = value.split("\0");
  const branch = parseBranch(entries.shift() ?? "");
  const files: WorkspaceGitFile[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    const indexStatus = entry.slice(0, 1);
    const workTreeStatus = entry.slice(1, 2);
    const path = entry.slice(3);
    const renamed = indexStatus === "R" || indexStatus === "C" || workTreeStatus === "R" || workTreeStatus === "C";
    const renamedFrom = renamed ? entries[++index] : undefined;
    files.push({ indexStatus, workTreeStatus, path, ...(renamedFrom ? { renamedFrom } : {}) });
  }
  return { ...branch, files };
}

async function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn("git", args, { cwd, windowsHide: true, shell: false });
    let stdout = "";
    let stderr = "";
    const append = (current: string, chunk: Buffer): string => {
      if (current.length >= MAX_GIT_OUTPUT_LENGTH) return current;
      return `${current}${chunk.toString("utf8")}`.slice(0, MAX_GIT_OUTPUT_LENGTH);
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.on("error", reject);
    child.on("close", (exitCode) => resolveResult({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
}

export class WorkspaceGitService {
  constructor(
    private readonly getWorkspaceRoot: () => string,
    private readonly files: WorkspaceFileService,
  ) {}

  async getStatus(): Promise<WorkspaceGitStatus> {
    try {
      const cwd = await this.getGitCwd();
      if (!cwd) return { available: false, files: [], error: "当前工作区不是 Git 仓库" };
      const result = await runGit(cwd, ["status", "--porcelain=v1", "-z", "--branch"]);
      if (result.exitCode !== 0) return { available: false, files: [], error: result.stderr.trim() || "无法读取 Git 状态" };
      return { available: true, ...parseStatus(result.stdout) };
    } catch (error) {
      return { available: false, files: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  async getDiff(requestPath: unknown, staged: boolean): Promise<WorkspaceGitDiff> {
    const path = await this.files.toWorkspaceRelative(requestPath);
    if (!path) throw new Error("请选择工作区内的文件");
    const cwd = await this.getGitCwd();
    if (!cwd) throw new Error("当前工作区不是 Git 仓库");
    const result = await runGit(cwd, ["diff", "--no-ext-diff", "--unified=3", ...(staged ? ["--cached"] : []), "--", path]);
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "无法读取 Git Diff");
    const truncated = result.stdout.length >= MAX_GIT_OUTPUT_LENGTH;
    return { path, staged, diff: result.stdout, truncated };
  }

  private async getGitCwd(): Promise<string | null> {
    const workspace = this.getWorkspaceRoot();
    if (!workspace) return null;
    const cwd = await realpath(workspace);
    const result = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
    if (result.exitCode !== 0) return null;
    const repositoryRoot = await realpath(resolve(result.stdout.trim()));
    return isContained(repositoryRoot, cwd) ? cwd : null;
  }
}
