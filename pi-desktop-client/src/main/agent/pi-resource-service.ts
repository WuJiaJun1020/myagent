import { homedir } from "node:os";
import { basename, extname, relative, resolve, sep } from "node:path";
import type {
  McpServerSummary,
  MemoryResource,
  RuntimeResourceIssue,
  RuntimeResourceSnapshot,
  RuntimeSourceScope,
  RuntimeToolPermission,
  RuntimeToolSource,
  RuntimeToolSummary,
} from "../../shared/contracts/runtime-resources";
import { PiProcess } from "../pi-process";

type UnknownRecord = Record<string, unknown>;

const RPC_TIMEOUT = 30_000;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_MEMORY_LENGTH = 100_000;
const MAX_TOTAL_MEMORY_LENGTH = 400_000;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function comparablePath(path: string): string {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLocaleLowerCase() : normalized;
}

function isWithin(path: string, root: string): boolean {
  const candidate = comparablePath(path);
  const parent = comparablePath(root);
  return candidate === parent || candidate.startsWith(parent.endsWith(sep) ? parent : `${parent}${sep}`);
}

function displayPath(path: string, cwd: string): string {
  if (!path) return "未知来源";
  if (isWithin(path, cwd)) {
    const local = relative(resolve(cwd), resolve(path));
    return local ? `./${local.split(sep).join("/")}` : ".";
  }
  const home = homedir();
  if (isWithin(path, home)) {
    const local = relative(home, resolve(path));
    return `~/${local.split(sep).join("/")}`;
  }
  return path;
}

function sourceInfo(value: unknown, cwd: string): RuntimeToolSource | undefined {
  if (!isRecord(value)) return undefined;
  const path = readString(value.path);
  const rawSource = readString(value.source);
  if (!path || !rawSource) return undefined;
  const scope = value.scope === "user" || value.scope === "project" || value.scope === "temporary"
    ? value.scope
    : "temporary";
  const origin = value.origin === "package" ? "package" : "top-level";
  const signature = `${rawSource} ${path}`.toLocaleLowerCase();
  const kind = rawSource === "builtin" || path.startsWith("<builtin:")
    ? "builtin"
    : rawSource === "sdk" || path.startsWith("<sdk:")
      ? "sdk"
      : signature.includes("mcp")
        ? "mcp"
        : "extension";
  const fallbackName = basename(path, extname(path)) || rawSource;
  return {
    kind,
    label: kind === "builtin" ? "Pi 内置" : kind === "sdk" ? "SDK" : rawSource === "local" ? fallbackName : rawSource,
    scope: kind === "builtin" ? "builtin" : scope,
    origin,
    path: path.startsWith("<") ? path : displayPath(path, cwd),
  };
}

function toolPermissions(name: string, source: RuntimeToolSource): RuntimeToolPermission[] {
  const normalized = name.toLocaleLowerCase();
  const permissions = new Set<RuntimeToolPermission>();
  if (
    normalized === "read"
    || normalized === "grep"
    || normalized === "ls"
    || normalized.includes("search")
    || normalized.includes("find")
  ) {
    permissions.add("workspace-read");
  }
  if (normalized === "edit" || normalized === "write" || normalized.includes("patch")) {
    permissions.add("workspace-write");
  }
  if (normalized === "bash" || normalized.includes("terminal") || normalized.includes("shell")) {
    permissions.add("process");
  }
  if (source.kind === "mcp") permissions.add("external-service");
  return [...permissions];
}

function parseTools(value: unknown, cwd: string): RuntimeToolSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): RuntimeToolSummary[] => {
    if (!isRecord(item)) return [];
    const name = readString(item.name);
    const source = sourceInfo(item.sourceInfo, cwd);
    if (!name || !source) return [];
    const description = readString(item.description);
    return [{
      name,
      description: description?.slice(0, MAX_DESCRIPTION_LENGTH),
      active: item.active === true,
      permissions: toolPermissions(name, source),
      source,
    }];
  }).sort((left, right) => Number(right.active) - Number(left.active) || left.name.localeCompare(right.name));
}

function isMcpSignature(...values: Array<string | undefined>): boolean {
  return values.some((value) => value?.toLocaleLowerCase().includes("mcp"));
}

function parseIssues(value: unknown, cwd: string): RuntimeResourceIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): RuntimeResourceIssue[] => {
    if (!isRecord(item)) return [];
    const path = readString(item.path);
    const message = readString(item.error);
    return path && message ? [{ source: displayPath(path, cwd), message: message.slice(0, 4_000) }] : [];
  });
}

function parseMcpServers(
  value: unknown,
  issues: RuntimeResourceIssue[],
  tools: RuntimeToolSummary[],
  cwd: string,
): McpServerSummary[] {
  const servers = new Map<string, McpServerSummary>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item) || !isRecord(item.sourceInfo)) continue;
      const path = readString(item.path);
      const source = readString(item.sourceInfo.source);
      const sourcePath = readString(item.sourceInfo.path);
      if (!isMcpSignature(path, source, sourcePath)) continue;
      const parsedSource = sourceInfo(item.sourceInfo, cwd);
      if (!parsedSource) continue;
      const toolNames = readStringArray(item.toolNames);
      const id = `${sourcePath ?? path ?? source}:${parsedSource.scope}`;
      servers.set(id, {
        id,
        name: parsedSource.label,
        source: parsedSource.path,
        scope: parsedSource.scope,
        status: "loaded",
        statusDetail: toolNames.some((name) => tools.find((tool) => tool.name === name)?.active)
          ? "扩展已加载，Tool 已注册"
          : "扩展已加载，当前没有启用的 Tool",
        toolNames,
      });
    }
  }

  for (const issue of issues) {
    if (!isMcpSignature(issue.source, issue.message)) continue;
    const id = `error:${issue.source}`;
    if (!servers.has(id)) {
      servers.set(id, {
        id,
        name: basename(issue.source, extname(issue.source)) || "MCP Extension",
        source: issue.source,
        scope: "temporary",
        status: "error",
        statusDetail: issue.message,
        toolNames: [],
      });
    }
  }
  return [...servers.values()];
}

function memoryScope(path: string, cwd: string): MemoryResource["scope"] {
  const agentDir = resolve(cwd, process.env.PI_CODING_AGENT_DIR ?? resolve(homedir(), ".pi", "agent"));
  if (isWithin(path, agentDir)) return "user";
  if (isWithin(path, cwd)) return "workspace";
  return "ancestor";
}

function parseMemories(value: unknown, cwd: string): MemoryResource[] {
  if (!Array.isArray(value)) return [];
  let remaining = MAX_TOTAL_MEMORY_LENGTH;
  return value.flatMap((item, index): MemoryResource[] => {
    if (!isRecord(item)) return [];
    const path = readString(item.path);
    const rawContent = readString(item.content);
    const kind = item.kind === "instructions" || item.kind === "system" || item.kind === "append-system"
      ? item.kind
      : undefined;
    if (!path || rawContent === undefined || !kind) return [];
    const allowed = Math.max(0, Math.min(MAX_MEMORY_LENGTH, remaining));
    const content = rawContent.slice(0, allowed);
    remaining -= content.length;
    return [{
      id: `${kind}:${path}:${index}`,
      name: basename(path) || path,
      kind,
      scope: memoryScope(path, cwd),
      source: displayPath(path, cwd),
      content,
      truncated: item.truncated === true || content.length < rawContent.length,
      enabled: true,
    }];
  });
}

export function adaptPiResources(value: unknown, cwd: string): RuntimeResourceSnapshot {
  if (!isRecord(value)) throw new Error("Pi 返回了无效的资源状态");
  const tools = parseTools(value.tools, cwd);
  const issues = parseIssues(value.extensionErrors, cwd);
  return {
    capabilities: {
      nativeMcp: isRecord(value.capabilities) && value.capabilities.nativeMcp === true,
      semanticMemory: isRecord(value.capabilities) && value.capabilities.semanticMemory === true,
    },
    tools,
    mcpServers: parseMcpServers(value.extensions, issues, tools, cwd),
    memories: parseMemories(value.contextResources, cwd),
    issues,
    updatedAt: Date.now(),
  };
}

export class PiResourceService {
  constructor(private readonly pi: PiProcess) {}

  async getSnapshot(): Promise<RuntimeResourceSnapshot> {
    const response = await this.pi.send({ type: "get_resources" }, RPC_TIMEOUT);
    if (!isRecord(response.data)) throw new Error(`Pi RPC ${response.command ?? "get_resources"} 缺少有效数据`);
    return adaptPiResources(response.data, this.pi.getStatus().cwd);
  }
}
