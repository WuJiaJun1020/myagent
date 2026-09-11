import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import type { SessionMode } from "../../shared/contracts/agent-session";

type UnknownRecord = Record<string, unknown>;

export type PiSessionIndexEntry = {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  mode: SessionMode;
  createdAt: number;
  modifiedAt: number;
  messageCount: number;
  firstMessage: string;
};

export type PiSessionIndexOptions = {
  activeSessionFile?: string;
  sessionDir?: string;
  agentDir?: string;
};

const MAX_CONCURRENT_READS = 10;
const MAX_FIRST_MESSAGE_LENGTH = 240;
const SESSION_MODE_ENTRY_TYPE = "pi.rpc.session-mode";

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedPath(value: string, baseDir: string = process.cwd()): string {
  const expanded = value === "~" || value.startsWith("~/") || value.startsWith("~\\")
    ? join(homedir(), value.slice(2))
    : value;
  return resolve(baseDir, expanded);
}

function comparablePath(value: string): string {
  const normalized = normalizedPath(value);
  return process.platform === "win32" ? normalized.toLocaleLowerCase() : normalized;
}

function defaultAgentDir(agentDir?: string, cwd: string = process.cwd()): string {
  return normalizedPath(agentDir ?? process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"), cwd);
}

export function getDefaultPiSessionDir(cwd: string, agentDir?: string): string {
  const resolvedCwd = normalizedPath(cwd);
  const safePath = `--${resolvedCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  return join(defaultAgentDir(agentDir, resolvedCwd), "sessions", safePath);
}

async function readConfiguredSessionDir(cwd: string, agentDir: string): Promise<string | undefined> {
  const paths = [join(agentDir, "settings.json"), join(normalizedPath(cwd), ".pi", "settings.json")];
  let sessionDir: string | undefined;
  for (const path of paths) {
    try {
      const parsed: unknown = JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
      if (isRecord(parsed) && typeof parsed.sessionDir === "string" && parsed.sessionDir.trim()) {
        sessionDir = parsed.sessionDir;
      }
    } catch {
      // Pi ignores absent settings here; invalid settings are reported by Pi itself.
    }
  }
  return sessionDir ? normalizedPath(sessionDir, cwd) : undefined;
}

async function resolveSessionDir(
  cwd: string,
  options: PiSessionIndexOptions,
): Promise<{ path: string; filterByCwd: boolean }> {
  const fallback = getDefaultPiSessionDir(cwd, options.agentDir);
  let selected: string | undefined;

  if (options.activeSessionFile && isAbsolute(options.activeSessionFile)) {
    selected = dirname(normalizedPath(options.activeSessionFile));
  } else if (options.sessionDir) {
    selected = normalizedPath(options.sessionDir, cwd);
  } else if (process.env.PI_CODING_AGENT_SESSION_DIR) {
    selected = normalizedPath(process.env.PI_CODING_AGENT_SESSION_DIR, cwd);
  } else {
    selected = await readConfiguredSessionDir(cwd, defaultAgentDir(options.agentDir, cwd));
  }

  const path = selected ?? fallback;
  return { path, filterByCwd: comparablePath(path) !== comparablePath(fallback) };
}

function extractText(message: UnknownRecord): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .filter((block): block is UnknownRecord => isRecord(block) && block.type === "text" && typeof block.text === "string")
    .map((block) => String(block.text))
    .join(" ");
}

function truncateSummary(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_FIRST_MESSAGE_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_FIRST_MESSAGE_LENGTH - 1)}…`;
}

function readTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

async function readSessionInfo(filePath: string): Promise<PiSessionIndexEntry | null> {
  try {
    const fileStat = await stat(filePath);
    let header: UnknownRecord | null = null;
    let messageCount = 0;
    let firstMessage = "";
    let name: string | undefined;
    let mode: SessionMode = "work";
    let lastActivityAt: number | undefined;

    const lines = createInterface({
      input: createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    for await (const line of lines) {
      if (!line.trim()) continue;
      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isRecord(entry)) continue;

      if (!header) {
        if (entry.type !== "session" || typeof entry.id !== "string") return null;
        header = entry;
        continue;
      }

      if (entry.type === "session_info") {
        name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : undefined;
        continue;
      }
      if (entry.type === "custom" && entry.customType === SESSION_MODE_ENTRY_TYPE && isRecord(entry.data)) {
        const storedMode = entry.data.mode;
        if (storedMode === "work" || storedMode === "chat") mode = storedMode;
        continue;
      }
      if (entry.type !== "message") continue;
      messageCount += 1;

      if (!isRecord(entry.message)) continue;
      const role = entry.message.role;
      if (role !== "user" && role !== "assistant") continue;
      const activityAt = readTimestamp(entry.message.timestamp) ?? readTimestamp(entry.timestamp);
      if (activityAt !== undefined) lastActivityAt = Math.max(lastActivityAt ?? 0, activityAt);
      if (!firstMessage && role === "user") firstMessage = extractText(entry.message);
    }

    if (!header || typeof header.id !== "string") return null;
    const fallbackCreatedAt = fileStat.birthtimeMs || fileStat.mtimeMs;
    const createdAt = readTimestamp(header.timestamp) ?? fallbackCreatedAt;
    return {
      path: filePath,
      id: header.id,
      cwd: typeof header.cwd === "string" ? header.cwd : "",
      name,
      mode,
      createdAt,
      modifiedAt: lastActivityAt ?? createdAt,
      messageCount,
      firstMessage: truncateSummary(firstMessage) || "（无消息）",
    };
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function listPiSessions(
  cwd: string,
  options: PiSessionIndexOptions = {},
): Promise<PiSessionIndexEntry[]> {
  const resolvedCwd = comparablePath(cwd);
  const sessionDir = await resolveSessionDir(cwd, options);
  let files: string[];
  try {
    files = (await readdir(sessionDir.path, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => join(sessionDir.path, entry.name));
  } catch {
    return [];
  }

  const entries = await mapWithConcurrency(files, MAX_CONCURRENT_READS, readSessionInfo);
  return entries
    .filter((entry): entry is PiSessionIndexEntry => entry !== null)
    .filter((entry) => !sessionDir.filterByCwd || (entry.cwd && comparablePath(entry.cwd) === resolvedCwd))
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
}
