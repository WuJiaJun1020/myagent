import { lstat, open, readdir, realpath, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { RpcMessage } from "../../shared/rpc";
import { createUnifiedDiff } from "../../shared/unified-diff";
import type {
  FileChange,
  WorkspaceDirectoryListing,
  WorkspaceEntry,
  WorkspaceFileReference,
  WorkspaceFileSaveRequest,
  WorkspaceTextFile,
} from "../../shared/contracts/workspace";

const MAX_DIRECTORY_ENTRIES = 500;
const MAX_FILE_BYTES = 1_000_000;
const MAX_CHANGE_BYTES = 500_000;
const MAX_DIFF_LENGTH = 200_000;
const MAX_WORKSPACE_SNAPSHOT_FILES = 20_000;
const MAX_WORKSPACE_SNAPSHOT_BYTES = 32 * 1024 * 1024;
const MAX_SEARCH_RESULTS = 60;
const MAX_SEARCH_ENTRIES = 20_000;
const SEARCH_IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "release", ".cache"]);
const SNAPSHOT_IGNORED_DIRECTORIES = new Set([
  ...SEARCH_IGNORED_DIRECTORIES,
  "build",
  "coverage",
  ".next",
  "out",
  "target",
  "__pycache__",
]);

type FileSnapshot = {
  exists: boolean;
  content?: string;
  truncated?: boolean;
  size?: number;
  modifiedAt?: number;
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

function snapshotsEqual(before: FileSnapshot | undefined, after: FileSnapshot | undefined): boolean {
  if (!before || !after) return before === after;
  if (before.truncated || after.truncated) {
    return before.size === after.size && before.modifiedAt === after.modifiedAt;
  }
  if (before.content !== undefined && after.content !== undefined) return before.content === after.content;
  return before.size === after.size && before.modifiedAt === after.modifiedAt;
}

export { createUnifiedDiff } from "../../shared/unified-diff";

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

  async searchFiles(value: unknown): Promise<WorkspaceFileReference[]> {
    if (typeof value !== "string" || value.length > 200) throw new Error("文件搜索内容无效");
    const query = value.trim().replaceAll("\\", "/").toLocaleLowerCase();
    const root = await this.resolveExistingPath("");
    const matches: Array<WorkspaceFileReference & { score: number }> = [];
    const directories = [{ absolute: root, relative: "" }];
    let visited = 0;

    while (directories.length > 0 && visited < MAX_SEARCH_ENTRIES) {
      const current = directories.shift()!;
      let entries;
      try {
        entries = await readdir(current.absolute, { withFileTypes: true });
      } catch {
        continue;
      }
      entries.sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }));
      for (const entry of entries) {
        visited += 1;
        if (visited > MAX_SEARCH_ENTRIES) break;
        if (entry.isSymbolicLink()) continue;
        const path = joinRelative(current.relative, entry.name);
        if (entry.isDirectory()) {
          if (!SEARCH_IGNORED_DIRECTORIES.has(entry.name) && !path.startsWith(".pi/npm/") && !path.startsWith(".pi/git/")) {
            directories.push({ absolute: join(current.absolute, entry.name), relative: path });
          }
          continue;
        }
        if (!entry.isFile()) continue;
        const normalized = path.toLocaleLowerCase();
        const name = entry.name.toLocaleLowerCase();
        if (query && !normalized.includes(query)) continue;
        const score = query === "" ? 3 : name === query ? 0 : name.startsWith(query) ? 1 : name.includes(query) ? 2 : 3;
        matches.push({ name: entry.name, path, score });
      }
    }

    return matches
      .sort((left, right) => left.score - right.score || left.path.length - right.path.length || left.path.localeCompare(right.path))
      .slice(0, MAX_SEARCH_RESULTS)
      .map(({ name, path }) => ({ name, path }));
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

  async saveFile(request: WorkspaceFileSaveRequest): Promise<WorkspaceTextFile> {
    if (!isRecord(request)) throw new Error("保存请求无效");
    const normalizedPath = normalizeRequestPath(request.path);
    if (!normalizedPath) throw new Error("请选择工作区内的文件");
    if (typeof request.content !== "string") throw new Error("文件内容必须是文本");
    if (!Number.isFinite(request.expectedModifiedAt)) throw new Error("文件版本信息无效，请重新打开文件");
    if (Buffer.byteLength(request.content, "utf8") > MAX_FILE_BYTES) {
      throw new Error("编辑器最多保存 1 MB 的文本文件");
    }

    const absolutePath = await this.resolveExistingPath(normalizedPath);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) throw new Error("请求的路径不是普通文件");
    if (Math.abs(fileStat.mtimeMs - request.expectedModifiedAt) > 1) {
      throw new Error("文件已在磁盘上变更，请重新加载后再保存，避免覆盖外部修改");
    }
    const current = await readLimitedFile(absolutePath, MAX_FILE_BYTES);
    if (current.truncated) throw new Error("大文件只能预览，不能在客户端直接保存");

    await writeFile(absolutePath, request.content, "utf8");
    return this.readFile(normalizedPath);
  }

  async revertAgentChange(change: FileChange): Promise<void> {
    if (!isRecord(change) || typeof change.path !== "string") throw new Error("Agent 变更无效");
    if (change.beforeContent !== undefined && typeof change.beforeContent !== "string") throw new Error("Agent 变更内容无效");
    if (change.afterContent !== undefined && typeof change.afterContent !== "string") throw new Error("Agent 变更内容无效");
    if (change.truncated) throw new Error("变更内容已截断，无法安全撤销");
    const normalizedPath = normalizeRequestPath(change.path);
    if (!normalizedPath) throw new Error("Agent 变更路径无效");
    const current = await this.snapshot(normalizedPath);
    const expectedExists = change.afterContent !== undefined;
    if (current.exists !== expectedExists || current.content !== change.afterContent) {
      throw new Error("文件已在 Agent 变更后被修改，无法安全撤销；请先在 Diff 中人工处理");
    }

    if (change.beforeContent === undefined) {
      const absolutePath = await this.resolveExistingPath(normalizedPath);
      await unlink(absolutePath);
      return;
    }

    const absolutePath = await this.resolveWritablePath(normalizedPath);
    await writeFile(absolutePath, change.beforeContent, "utf8");
  }

  async snapshot(requestPath: unknown): Promise<FileSnapshot> {
    const normalizedPath = normalizeRequestPath(requestPath);
    if (!normalizedPath) return { exists: false };
    try {
      const absolutePath = await this.resolveExistingPath(normalizedPath);
      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile()) return { exists: false };
      const result = await readLimitedFile(absolutePath, MAX_CHANGE_BYTES);
      return {
        exists: true,
        content: result.content,
        truncated: result.truncated,
        size: fileStat.size,
        modifiedAt: fileStat.mtimeMs,
      };
    } catch (error) {
      if (isRecord(error) && error.code === "ENOENT") return { exists: false };
      throw error;
    }
  }

  async snapshotWorkspace(): Promise<Map<string, FileSnapshot>> {
    const root = await this.resolveExistingPath("");
    const paths: string[] = [];
    const directories = [{ absolute: root, relative: "" }];

    while (directories.length > 0 && paths.length < MAX_WORKSPACE_SNAPSHOT_FILES) {
      const current = directories.shift()!;
      let entries;
      try {
        entries = await readdir(current.absolute, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const relativePath = joinRelative(current.relative, entry.name);
        const absolutePath = join(current.absolute, entry.name);
        if (entry.isDirectory()) {
          if (!SNAPSHOT_IGNORED_DIRECTORIES.has(entry.name)) {
            directories.push({ absolute: absolutePath, relative: relativePath });
          }
        } else if (entry.isFile()) {
          paths.push(relativePath);
          if (paths.length >= MAX_WORKSPACE_SNAPSHOT_FILES) break;
        }
      }
    }

    const snapshots = new Map<string, FileSnapshot>();
    let capturedBytes = 0;
    for (const path of paths.sort()) {
      const absolutePath = resolve(root, path);
      assertContained(root, absolutePath);
      try {
        const fileStat = await stat(absolutePath);
        const remainingBytes = MAX_WORKSPACE_SNAPSHOT_BYTES - capturedBytes;
        if (remainingBytes <= 0) {
          snapshots.set(path, { exists: true, truncated: true, size: fileStat.size, modifiedAt: fileStat.mtimeMs });
          continue;
        }
        try {
          const result = await readLimitedFile(absolutePath, Math.min(MAX_CHANGE_BYTES, remainingBytes));
          capturedBytes += Buffer.byteLength(result.content, "utf8");
          snapshots.set(path, {
            exists: true,
            content: result.content,
            truncated: result.truncated || fileStat.size > remainingBytes,
            size: fileStat.size,
            modifiedAt: fileStat.mtimeMs,
          });
        } catch {
          snapshots.set(path, { exists: true, truncated: true, size: fileStat.size, modifiedAt: fileStat.mtimeMs });
        }
      } catch {
        // A command can remove a file while the workspace snapshot is being captured.
      }
    }
    return snapshots;
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

  private async resolveWritablePath(requestPath: string): Promise<string> {
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) throw new Error("尚未选择工作区");
    const rootPath = await realpath(workspaceRoot);
    const lexicalPath = resolve(rootPath, requestPath);
    assertContained(rootPath, lexicalPath);
    const parentPath = await realpath(dirname(lexicalPath));
    assertContained(rootPath, parentPath);
    return join(parentPath, basename(lexicalPath));
  }
}

function createWorkspaceChanges(
  before: Map<string, FileSnapshot>,
  after: Map<string, FileSnapshot>,
): FileChange[] {
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const timestamp = Date.now();
  return paths.flatMap((path, index): FileChange[] => {
    const previous = before.get(path);
    const current = after.get(path);
    if (snapshotsEqual(previous, current)) return [];
    const beforeExists = Boolean(previous?.exists);
    const afterExists = Boolean(current?.exists);
    const truncated = Boolean(previous?.truncated || current?.truncated);
    const beforeContent = truncated ? undefined : previous?.content;
    const afterContent = truncated ? undefined : current?.content;
    const generatedDiff = truncated ? "" : createUnifiedDiff(path, beforeContent ?? "", afterContent ?? "");
    const limited = limitDiff(generatedDiff);
    return [{
      path,
      changeType: !beforeExists ? "created" : !afterExists ? "deleted" : "modified",
      beforeContent,
      afterContent,
      unifiedDiff: limited.diff,
      timestamp: timestamp + index,
      truncated: truncated || limited.truncated,
    }];
  });
}

export class FileChangeTracker {
  private workspaceBaseline: Map<string, FileSnapshot> | undefined;

  constructor(private readonly files: WorkspaceFileService) {}

  async beginRun(): Promise<void> {
    if (!this.workspaceBaseline) this.workspaceBaseline = await this.files.snapshotWorkspace();
  }

  async captureStart(event: RpcMessage): Promise<void> {
    if (event.type === "agent_start") await this.beginRun();
  }

  async captureEnd(event: RpcMessage): Promise<FileChange[]> {
    if (event.type !== "agent_settled" || !this.workspaceBaseline) return [];
    const before = this.workspaceBaseline;
    this.workspaceBaseline = undefined;
    const after = await this.files.snapshotWorkspace();
    return createWorkspaceChanges(before, after);
  }

  clear(): void {
    this.workspaceBaseline = undefined;
  }
}
