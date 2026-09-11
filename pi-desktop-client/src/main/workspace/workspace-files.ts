import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { RpcMessage } from "../../shared/rpc";
import type {
  FileChange,
  WorkspaceDirectoryListing,
  WorkspaceEntry,
  WorkspaceTextFile,
} from "../../shared/contracts/workspace";

const MAX_DIRECTORY_ENTRIES = 500;
const MAX_FILE_BYTES = 1_000_000;
const MAX_CHANGE_BYTES = 500_000;
const MAX_DIFF_LENGTH = 200_000;

type FileSnapshot = {
  exists: boolean;
  content?: string;
  truncated?: boolean;
};

type PendingMutation = {
  path: string;
  before: FileSnapshot;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRequestPath(value: unknown): string {
  if (typeof value !== "string") throw new Error("工作区路径必须是字符串");
  if (value.includes("\0")) throw new Error("工作区路径包含无效字符");
  if (isAbsolute(value)) throw new Error("仅允许访问当前工作区内的相对路径");

  const normalized = value.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (normalized.split("/").includes("..")) throw new Error("不允许访问当前工作区之外的路径");
  return normalized === "." ? "" : normalized;
}

function assertContained(root: string, target: string): void {
  const childPath = relative(root, target);
  if (childPath === "") return;
  if (childPath === ".." || childPath.startsWith(`..${sep}`) || isAbsolute(childPath)) {
    throw new Error("不允许访问当前工作区之外的路径");
  }
}

function joinRelative(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function isBinary(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.length, 8_192);
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

async function readLimitedFile(path: string, maxBytes: number): Promise<{ content: string; truncated: boolean }> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const contentBuffer = buffer.subarray(0, Math.min(bytesRead, maxBytes));
    if (isBinary(contentBuffer)) throw new Error("暂不支持在代码查看器中打开二进制文件");
    return { content: contentBuffer.toString("utf8"), truncated: bytesRead > maxBytes };
  } finally {
    await handle.close();
  }
}

function limitDiff(diff: string): { diff: string; truncated: boolean } {
  if (diff.length <= MAX_DIFF_LENGTH) return { diff, truncated: false };
  return {
    diff: `${diff.slice(0, MAX_DIFF_LENGTH)}\n\n[Diff 过长，已截断]`,
    truncated: true,
  };
}

function splitLines(content: string): string[] {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

export function createUnifiedDiff(path: string, before: string, after: string): string {
  if (before === after) return "";
  const oldLines = splitLines(before);
  const newLines = splitLines(after);
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix
    && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix += 1;

  const contextBefore = Math.min(3, prefix);
  const contextAfter = Math.min(3, suffix);
  const oldStart = prefix - contextBefore;
  const newStart = prefix - contextBefore;
  const oldChangedEnd = oldLines.length - suffix;
  const newChangedEnd = newLines.length - suffix;
  const oldCount = oldChangedEnd - oldStart + contextAfter;
  const newCount = newChangedEnd - newStart + contextAfter;
  const output = [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${oldStart + 1},${oldCount} +${newStart + 1},${newCount} @@`,
  ];

  for (let index = oldStart; index < prefix; index += 1) output.push(` ${oldLines[index]}`);
  for (let index = prefix; index < oldChangedEnd; index += 1) output.push(`-${oldLines[index]}`);
  for (let index = prefix; index < newChangedEnd; index += 1) output.push(`+${newLines[index]}`);
  for (let index = 0; index < contextAfter; index += 1) output.push(` ${oldLines[oldChangedEnd + index]}`);
  return output.join("\n");
}

export class WorkspaceFileService {
  constructor(private readonly getWorkspaceRoot: () => string) {}

  async toWorkspaceRelative(requestPath: unknown): Promise<string> {
    if (typeof requestPath !== "string") throw new Error("工作区路径必须是字符串");
    if (!isAbsolute(requestPath)) return normalizeRequestPath(requestPath);
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) throw new Error("尚未选择工作区");
    const rootPath = await realpath(workspaceRoot);
    const lexicalPath = resolve(requestPath);
    assertContained(rootPath, lexicalPath);
    return relative(rootPath, lexicalPath).split(sep).join("/");
  }

  async listDirectory(requestPath: unknown): Promise<WorkspaceDirectoryListing> {
    const normalizedPath = normalizeRequestPath(requestPath);
    const absolutePath = await this.resolveExistingPath(normalizedPath);
    const directoryStat = await stat(absolutePath);
    if (!directoryStat.isDirectory()) throw new Error("请求的路径不是目录");

    const allEntries = await readdir(absolutePath, { withFileTypes: true });
    allEntries.sort((left, right) => {
      const leftRank = left.isDirectory() ? 0 : left.isFile() ? 1 : 2;
      const rightRank = right.isDirectory() ? 0 : right.isFile() ? 1 : 2;
      return leftRank - rightRank || left.name.localeCompare(right.name, "zh-CN", { numeric: true });
    });
    const visibleEntries = allEntries.slice(0, MAX_DIRECTORY_ENTRIES);
    const entries: WorkspaceEntry[] = await Promise.all(visibleEntries.map(async (entry) => {
      const entryStat = await lstat(join(absolutePath, entry.name));
      return {
        name: entry.name,
        path: joinRelative(normalizedPath, entry.name),
        kind: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "symlink",
        size: entry.isFile() ? entryStat.size : undefined,
        modifiedAt: entryStat.mtimeMs,
      };
    }));

    return { path: normalizedPath, entries, truncated: allEntries.length > visibleEntries.length };
  }

  async readFile(requestPath: unknown): Promise<WorkspaceTextFile> {
    const normalizedPath = normalizeRequestPath(requestPath);
    if (!normalizedPath) throw new Error("请选择工作区内的文件");
    const absolutePath = await this.resolveExistingPath(normalizedPath);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) throw new Error("请求的路径不是普通文件");
    const { content, truncated } = await readLimitedFile(absolutePath, MAX_FILE_BYTES);
    return {
      name: basename(normalizedPath),
      path: normalizedPath,
      content,
      size: fileStat.size,
      modifiedAt: fileStat.mtimeMs,
      truncated,
    };
  }

  async snapshot(requestPath: unknown): Promise<FileSnapshot> {
    const normalizedPath = normalizeRequestPath(requestPath);
    if (!normalizedPath) return { exists: false };
    try {
      const absolutePath = await this.resolveExistingPath(normalizedPath);
      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile()) return { exists: false };
      const result = await readLimitedFile(absolutePath, MAX_CHANGE_BYTES);
      return { exists: true, content: result.content, truncated: result.truncated };
    } catch (error) {
      if (isRecord(error) && error.code === "ENOENT") return { exists: false };
      throw error;
    }
  }

  private async resolveExistingPath(requestPath: string): Promise<string> {
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) throw new Error("尚未选择工作区");
    const rootPath = await realpath(workspaceRoot);
    const lexicalPath = resolve(rootPath, requestPath || ".");
    assertContained(rootPath, lexicalPath);
    const resolvedPath = await realpath(lexicalPath);
    assertContained(rootPath, resolvedPath);
    return resolvedPath;
  }
}

function mutationPath(event: RpcMessage): string | undefined {
  const toolName = typeof event.toolName === "string" ? event.toolName.toLowerCase() : "";
  const simpleName = toolName.split(/[:/_.-]/).at(-1);
  if (simpleName !== "edit" && simpleName !== "write") return undefined;
  if (!isRecord(event.args) || typeof event.args.path !== "string") return undefined;
  return event.args.path;
}

function resultPatch(event: RpcMessage): string | undefined {
  if (!isRecord(event.result) || !isRecord(event.result.details)) return undefined;
  return typeof event.result.details.patch === "string" ? event.result.details.patch : undefined;
}

export class FileChangeTracker {
  private readonly pending = new Map<string, PendingMutation>();

  constructor(private readonly files: WorkspaceFileService) {}

  async captureStart(event: RpcMessage): Promise<void> {
    if (event.type !== "tool_execution_start" || typeof event.toolCallId !== "string") return;
    const inputPath = mutationPath(event);
    if (!inputPath) return;
    const path = await this.files.toWorkspaceRelative(inputPath);
    this.pending.set(event.toolCallId, { path, before: await this.files.snapshot(path) });
  }

  async captureEnd(event: RpcMessage): Promise<FileChange | undefined> {
    if (event.type !== "tool_execution_end" || typeof event.toolCallId !== "string") return undefined;
    const pending = this.pending.get(event.toolCallId);
    if (!pending) return undefined;
    this.pending.delete(event.toolCallId);

    const after = await this.files.snapshot(pending.path);
    if (pending.before.exists === after.exists && pending.before.content === after.content) return undefined;
    const changeType = !pending.before.exists ? "created" : !after.exists ? "deleted" : "modified";
    const generatedDiff = createUnifiedDiff(pending.path, pending.before.content ?? "", after.content ?? "");
    const limited = limitDiff(resultPatch(event) || generatedDiff);
    return {
      path: pending.path,
      changeType,
      beforeContent: pending.before.content,
      afterContent: after.content,
      unifiedDiff: limited.diff,
      toolCallId: event.toolCallId,
      timestamp: Date.now(),
      truncated: limited.truncated || pending.before.truncated || after.truncated,
    };
  }

  clear(): void {
    this.pending.clear();
  }
}
