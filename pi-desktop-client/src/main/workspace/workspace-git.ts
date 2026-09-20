import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { WorkspaceGitDiff, WorkspaceGitDiffScope, WorkspaceGitFile, WorkspaceGitStatus } from "../../shared/contracts/workspace";
import { WorkspaceFileService } from "./workspace-files";

const MAX_GIT_OUTPUT_LENGTH = 400_000;

type GitResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type GitLineStats = {
  additions: number;
  deletions: number;
  binary: boolean;
};

type GitContext = {
  repositoryRoot: string;
  workspacePrefix: string;
};

function isContained(parent: string, child: string): boolean {
  const value = relative(parent, child);
  return value === "" || (!value.startsWith(`..${sep}`) && value !== ".." && !isAbsolute(value));
}

export function toGitPath(workspacePrefix: string, workspacePath: string): string {
  return workspacePrefix ? `${workspacePrefix}/${workspacePath}` : workspacePath;
}

export function toWorkspacePath(workspacePrefix: string, gitPath: string): string | null {
  const normalized = gitPath.replaceAll("\\", "/");
  if (!workspacePrefix) return normalized;
  const prefix = `${workspacePrefix}/`;
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : null;
}

function parseBranch(value: string): Pick<WorkspaceGitStatus, "branch" | "ahead" | "behind"> {
  const descriptor = value.replace(/^##\s*/, "").split("...")[0]?.trim() ?? "";
  const branch = descriptor.replace(/^(?:No commits yet on|Initial commit on)\s+/, "");
  const ahead = Number(value.match(/ahead (\d+)/)?.[1] ?? "0");
  const behind = Number(value.match(/behind (\d+)/)?.[1] ?? "0");
  return {
    ...(branch && branch !== "HEAD (no branch)" ? { branch } : {}),
    ...(ahead > 0 ? { ahead } : {}),
    ...(behind > 0 ? { behind } : {}),
  };
}

export function parseGitStatus(value: string): Omit<WorkspaceGitStatus, "available" | "error"> {
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
    files.push({
      indexStatus,
      workTreeStatus,
      path,
      ...(renamedFrom ? { renamedFrom } : {}),
      additions: 0,
      deletions: 0,
      binary: false,
    });
  }
  return { ...branch, files };
}

export function parseGitNumstat(value: string): Map<string, GitLineStats> {
  const result = new Map<string, GitLineStats>();
  const entries = value.split("\0");
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    const firstTab = entry.indexOf("\t");
    const secondTab = entry.indexOf("\t", firstTab + 1);
    if (firstTab < 0 || secondTab < 0) continue;
    const added = entry.slice(0, firstTab);
    const deleted = entry.slice(firstTab + 1, secondTab);
    let path = entry.slice(secondTab + 1);
    if (!path) {
      index += 1;
      const renamedFrom = entries[index];
      index += 1;
      path = entries[index] ?? renamedFrom ?? "";
    }
    if (!path) continue;
    const binary = added === "-" || deleted === "-";
    result.set(path, {
      additions: binary ? 0 : Number(added) || 0,
      deletions: binary ? 0 : Number(deleted) || 0,
      binary,
    });
  }
  return result;
}

async function countUntrackedLines(cwd: string, path: string): Promise<GitLineStats> {
  const absolutePath = resolve(cwd, path);
  if (!isContained(cwd, absolutePath)) return { additions: 0, deletions: 0, binary: true };
  let additions = 0;
  let hasBytes = false;
  let lastByte = -1;
  for await (const chunk of createReadStream(absolutePath)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    hasBytes ||= buffer.length > 0;
    for (const byte of buffer) {
      if (byte === 0) return { additions: 0, deletions: 0, binary: true };
      if (byte === 10) additions += 1;
      lastByte = byte;
    }
  }
  if (hasBytes && lastByte !== 10) additions += 1;
  return { additions, deletions: 0, binary: false };
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
      const context = await this.getGitContext();
      if (!context) return { available: false, files: [], error: "当前工作区不是 Git 仓库" };
      const { repositoryRoot, workspacePrefix } = context;
      const scope = workspacePrefix || ".";
      const [statusResult, headStatsResult, stagedStatsResult, workTreeStatsResult] = await Promise.all([
        runGit(repositoryRoot, ["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all", "--", scope]),
        runGit(repositoryRoot, ["diff", "--numstat", "-z", "--no-ext-diff", "HEAD", "--", scope]),
        runGit(repositoryRoot, ["diff", "--numstat", "-z", "--no-ext-diff", "--cached", "--", scope]),
        runGit(repositoryRoot, ["diff", "--numstat", "-z", "--no-ext-diff", "--", scope]),
      ]);
      if (statusResult.exitCode !== 0) {
        return { available: false, files: [], error: statusResult.stderr.trim() || "无法读取 Git 状态" };
      }
      const parsedStatus = parseGitStatus(statusResult.stdout);
      const status = {
        ...parsedStatus,
        files: parsedStatus.files.flatMap((file): WorkspaceGitFile[] => {
          const path = toWorkspacePath(workspacePrefix, file.path);
          if (path === null) return [];
          const renamedFrom = file.renamedFrom
            ? toWorkspacePath(workspacePrefix, file.renamedFrom) ?? undefined
            : undefined;
          return [{ ...file, path, renamedFrom }];
        }),
      };
      const headStats = headStatsResult.exitCode === 0 ? parseGitNumstat(headStatsResult.stdout) : new Map<string, GitLineStats>();
      const stagedStats = parseGitNumstat(stagedStatsResult.stdout);
      const workTreeStats = parseGitNumstat(workTreeStatsResult.stdout);
      const files = await Promise.all(status.files.map(async (file): Promise<WorkspaceGitFile> => {
        const gitPath = toGitPath(workspacePrefix, file.path);
        const staged = stagedStats.get(gitPath);
        let unstaged = workTreeStats.get(gitPath);
        if (!unstaged && (file.indexStatus === "?" || file.workTreeStatus === "?")) {
          try {
            unstaged = await countUntrackedLines(repositoryRoot, gitPath);
          } catch {
            unstaged = { additions: 0, deletions: 0, binary: true };
          }
        }
        let stats = headStats.get(gitPath);
        if (!stats) {
          if (staged || unstaged) {
            stats = {
              additions: (staged?.additions ?? 0) + (unstaged?.additions ?? 0),
              deletions: (staged?.deletions ?? 0) + (unstaged?.deletions ?? 0),
              binary: Boolean(staged?.binary || unstaged?.binary),
            };
          }
        }
        return {
          ...file,
          ...(stats ?? { additions: 0, deletions: 0, binary: false }),
          stagedAdditions: staged?.additions ?? 0,
          stagedDeletions: staged?.deletions ?? 0,
          unstagedAdditions: unstaged?.additions ?? 0,
          unstagedDeletions: unstaged?.deletions ?? 0,
        };
      }));
      return {
        available: true,
        ...status,
        files,
        additions: files.reduce((total, file) => total + file.additions, 0),
        deletions: files.reduce((total, file) => total + file.deletions, 0),
      };
    } catch (error) {
      return { available: false, files: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  async getDiff(requestPath: unknown, scope: WorkspaceGitDiffScope, requestedContextLines = 3): Promise<WorkspaceGitDiff> {
    const path = await this.files.toWorkspaceRelative(requestPath);
    if (!path) throw new Error("请选择工作区内的文件");
    if (!Number.isInteger(requestedContextLines) || requestedContextLines < 0 || requestedContextLines > 10_000) {
      throw new Error("Git Diff 上下文行数无效");
    }
    const context = await this.getGitContext();
    if (!context) throw new Error("当前工作区不是 Git 仓库");
    const gitPath = toGitPath(context.workspacePrefix, path);
    const fileStatus = await runGit(
      context.repositoryRoot,
      ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", gitPath],
    );
    const untracked = fileStatus.stdout.startsWith("?? ");
    const args = untracked && scope !== "staged"
      ? ["diff", "--no-index", "--no-ext-diff", `--unified=${requestedContextLines}`, "--", "/dev/null", gitPath]
      : [
          "diff",
          "--no-ext-diff",
          `--unified=${requestedContextLines}`,
          ...(scope === "staged" ? ["--cached"] : scope === "uncommitted" ? ["HEAD"] : []),
          "--",
          gitPath,
        ];
    const result = await runGit(context.repositoryRoot, args);
    const successful = result.exitCode === 0 || (untracked && scope !== "staged" && result.exitCode === 1);
    if (!successful) throw new Error(result.stderr.trim() || "无法读取 Git Diff");
    const truncated = result.stdout.length >= MAX_GIT_OUTPUT_LENGTH;
    return { path, staged: scope === "staged", scope, diff: result.stdout, truncated };
  }

  private async getGitContext(): Promise<GitContext | null> {
    const workspace = this.getWorkspaceRoot();
    if (!workspace) return null;
    const workspaceRoot = await realpath(workspace);
    const result = await runGit(workspaceRoot, ["rev-parse", "--show-toplevel"]);
    if (result.exitCode !== 0) return null;
    const repositoryRoot = await realpath(resolve(result.stdout.trim()));
    if (!isContained(repositoryRoot, workspaceRoot)) return null;
    return {
      repositoryRoot,
      workspacePrefix: relative(repositoryRoot, workspaceRoot).split(sep).join("/"),
    };
  }
}
