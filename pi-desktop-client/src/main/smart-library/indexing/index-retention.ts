import type { DatabaseSync } from "node:sqlite";
import { lstat, readdir, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

// Called inside the same SQLite transaction as prepare/active-version changes.
// Keep only the active index plus, temporarily, the newest pending replacement.
export function pruneBookIndexRows(db: DatabaseSync, book: string, keep: string[]): string[] {
  const removed: string[] = [];
  for (const row of db.prepare("SELECT version FROM jobs WHERE book=?").all(book)) {
    const version = String(row.version);
    if (keep.includes(version)) continue;
    db.prepare("DELETE FROM chunk_terms WHERE version=?").run(version);
    db.prepare("DELETE FROM chunks WHERE version=?").run(version);
    db.prepare("DELETE FROM jobs WHERE version=? AND book=?").run(version, book);
    removed.push(version);
  }
  // Canonical chapters/paragraphs are shared by indexes with the same source.
  for (const table of ["paragraphs", "chapters"]) db.prepare(`DELETE FROM ${table} WHERE book=?
    AND source NOT IN (SELECT json_extract(data,'$.source') FROM jobs WHERE book=? AND json_extract(data,'$.source') IS NOT NULL)`).run(book, book);
  return removed;
}

// Also retries orphan-directory cleanup after a crash between SQL commit and rm.
export async function pruneUnreferencedVectorDirectories(db: DatabaseSync, root: string): Promise<void> {
  const directory = resolve(root, "vectors");
  const parent = await lstat(directory).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error; });
  if (!parent) return;
  if (parent.isSymbolicLink() || !parent.isDirectory()) throw Error("向量根目录类型异常，已停止清理");
  const retained = new Set(db.prepare("SELECT version FROM jobs").all().map(row => String(row.version)));
  for (const name of await readdir(directory).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; })) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(name) || retained.has(name)) continue;
    const target = resolve(directory, name), within = relative(directory, target);
    if (!within || isAbsolute(within) || within.startsWith("..")) throw Error("向量清理路径超出索引目录");
    const entry = await lstat(target);
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw Error("旧向量目录类型异常，已停止清理");
    await rm(target, { recursive: true, force: true });
  }
}

export function reclaimSqliteSpace(db: DatabaseSync): void {
  db.exec("INSERT INTO chunk_terms(chunk_terms) VALUES('optimize')");
  // Deleting rows alone only makes reusable free pages, not a smaller DB file.
  db.exec("VACUUM");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
}
