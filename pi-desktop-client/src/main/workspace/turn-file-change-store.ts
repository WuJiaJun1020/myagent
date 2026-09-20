import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SnapshotTurnFileChanges } from "../../shared/contracts/agent-session";
import type { FileChange, FileChangeType } from "../../shared/contracts/workspace";

const STORE_VERSION = 1;

type StoredSessionChanges = {
  version: typeof STORE_VERSION;
  sessionId: string;
  turns: SnapshotTurnFileChanges[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireSessionId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new Error("会话标识无效");
  }
  return value;
}

function requireTurnIndex(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error("会话轮次无效");
  }
  return value;
}

function parseChangeType(value: unknown): FileChangeType | undefined {
  return value === "created" || value === "modified" || value === "deleted" || value === "renamed"
    ? value
    : undefined;
}

function parseFileChange(value: unknown): FileChange | undefined {
  if (!isRecord(value)) return undefined;
  const changeType = parseChangeType(value.changeType);
  if (
    typeof value.path !== "string"
    || !changeType
    || typeof value.unifiedDiff !== "string"
    || typeof value.timestamp !== "number"
    || !Number.isFinite(value.timestamp)
  ) return undefined;
  if (value.beforeContent !== undefined && typeof value.beforeContent !== "string") return undefined;
  if (value.afterContent !== undefined && typeof value.afterContent !== "string") return undefined;
  if (value.toolCallId !== undefined && typeof value.toolCallId !== "string") return undefined;
  if (value.truncated !== undefined && typeof value.truncated !== "boolean") return undefined;
  return {
    path: value.path,
    changeType,
    beforeContent: value.beforeContent,
    afterContent: value.afterContent,
    unifiedDiff: value.unifiedDiff,
    toolCallId: value.toolCallId,
    timestamp: value.timestamp,
    truncated: value.truncated,
  };
}

function parseTurns(value: unknown): SnapshotTurnFileChanges[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): SnapshotTurnFileChanges[] => {
    if (!isRecord(entry)) return [];
    let turnIndex: number;
    try {
      turnIndex = requireTurnIndex(entry.turnIndex);
    } catch {
      return [];
    }
    if (!Array.isArray(entry.changes)) return [];
    const changes = entry.changes.map(parseFileChange).filter((change): change is FileChange => Boolean(change));
    return changes.length > 0 && changes.length === entry.changes.length ? [{ turnIndex, changes }] : [];
  });
}

export class TurnFileChangeStore {
  private readonly writes = new Map<string, Promise<void>>();

  constructor(private readonly directory: string) {}

  async load(sessionIdValue: unknown): Promise<SnapshotTurnFileChanges[]> {
    const sessionId = requireSessionId(sessionIdValue);
    await this.writes.get(sessionId)?.catch(() => undefined);
    return this.loadFromDisk(sessionId);
  }

  save(sessionIdValue: unknown, turnIndexValue: unknown, changesValue: unknown): Promise<void> {
    const sessionId = requireSessionId(sessionIdValue);
    const turnIndex = requireTurnIndex(turnIndexValue);
    const changes = Array.isArray(changesValue)
      ? changesValue.map(parseFileChange).filter((change): change is FileChange => Boolean(change))
      : [];
    if (changes.length === 0 || changes.length !== (changesValue as unknown[]).length) {
      return Promise.reject(new Error("文件变更数据无效"));
    }

    const previous = this.writes.get(sessionId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const turns = await this.loadFromDisk(sessionId);
      const byIndex = new Map(turns.map((entry) => [entry.turnIndex, entry]));
      byIndex.set(turnIndex, { turnIndex, changes });
      const storedTurns = [...byIndex.values()]
        .sort((left, right) => left.turnIndex - right.turnIndex);
      const payload: StoredSessionChanges = { version: STORE_VERSION, sessionId, turns: storedTurns };
      await mkdir(this.directory, { recursive: true });
      const targetPath = this.filePath(sessionId);
      const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryPath, JSON.stringify(payload), "utf8");
        await rename(temporaryPath, targetPath);
      } finally {
        try {
          await unlink(temporaryPath);
        } catch (error) {
          if (!isRecord(error) || error.code !== "ENOENT") throw error;
        }
      }
    });
    this.writes.set(sessionId, next);
    void next.finally(() => {
      if (this.writes.get(sessionId) === next) this.writes.delete(sessionId);
    }).catch(() => undefined);
    return next;
  }

  async remove(sessionIdValue: unknown): Promise<void> {
    const sessionId = requireSessionId(sessionIdValue);
    await this.writes.get(sessionId)?.catch(() => undefined);
    try {
      await unlink(this.filePath(sessionId));
    } catch (error) {
      if (!isRecord(error) || error.code !== "ENOENT") throw error;
    }
  }

  private async loadFromDisk(sessionId: string): Promise<SnapshotTurnFileChanges[]> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath(sessionId), "utf8"));
      if (!isRecord(parsed) || parsed.version !== STORE_VERSION || parsed.sessionId !== sessionId) return [];
      return parseTurns(parsed.turns).sort((left, right) => left.turnIndex - right.turnIndex);
    } catch (error) {
      if (error instanceof SyntaxError || (isRecord(error) && error.code === "ENOENT")) return [];
      throw error;
    }
  }

  private filePath(sessionId: string): string {
    const digest = createHash("sha256").update(sessionId).digest("hex");
    return join(this.directory, `${digest}.json`);
  }
}
