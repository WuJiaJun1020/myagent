import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { connect, type Table } from "@lancedb/lancedb";

export const VECTOR_STORAGE_POLICY = 2;
export class VectorStorageIntegrityError extends Error {}
export type VectorStorageReport = { policy: number; optimizedAt: number; beforeBytes: number; afterBytes: number; reclaimedBytes: number; beforeFiles: number; afterFiles: number; rows: number; fingerprint: string; versions: number };
export async function storageSize(directory: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0, files = 0;
  const entries = await readdir(directory, { withFileTypes: true });
  for (let i = 0; i < entries.length; i += 128) {
    const sizes = await Promise.all(entries.slice(i, i + 128).map(async entry => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return storageSize(path);
      if (!entry.isFile()) throw Error("向量目录包含非普通文件，已停止整理");
      return { bytes: (await stat(path)).size, files: 1 };
    }));
    for (const size of sizes) { bytes += size.bytes; files += size.files; }
  }
  return { bytes, files };
}
async function snapshot(table: Table) {
  const rows = await table.query().toArray();
  rows.sort((a, b) => Number(a.ordinal) - Number(b.ordinal));
  const hash = createHash("sha256");
  const ordinals = new Set<number>();
  for (const row of rows) {
    const ordinal = Number(row.ordinal);
    if (!Number.isInteger(ordinal) || ordinals.has(ordinal)) throw Error("向量片段序号无效或重复，已停止整理");
    ordinals.add(ordinal);
    const vector = Float32Array.from(row.vector);
    hash.update(JSON.stringify([row.id, ordinal, row.bookId, row.version, row.sourceVersion, row.chapter, vector.length]));
    hash.update(new Uint8Array(vector.buffer));
  }
  return { rows: rows.length, fingerprint: hash.digest("hex") };
}
// Caller must own a not-yet-published index, or have stopped every client
// accessing this directory. Removing old snapshots is unsafe for old readers.
export async function optimizeVectorStorage(directory: string, expectedRows: number, ownership: { exclusive: true }): Promise<VectorStorageReport> {
  if (ownership?.exclusive !== true) throw Error("仅在索引没有其他读写连接时才能清理历史版本");
  const before = await storageSize(directory);
  const connection = await connect(directory);
  try {
    const table = await connection.openTable("chunks");
    try {
      const prior = await snapshot(table);
      if (prior.rows !== expectedRows) throw new VectorStorageIntegrityError("向量数量与索引记录不同，已停止整理");
      // Compact first, verify exact contents, then prune all obsolete versions.
      // The dataset's current version is always retained by LanceDB.
      await table.optimize({ cleanupOlderThan: new Date(0), deleteUnverified: false });
      const afterSnapshot = await snapshot(table);
      if (afterSnapshot.rows !== prior.rows || afterSnapshot.fingerprint !== prior.fingerprint) throw new VectorStorageIntegrityError("整理前后的向量或片段标识不一致，请保留原索引并反馈");
      await table.optimize({ cleanupOlderThan: new Date(Date.now() + 1), deleteUnverified: true });
      const versions = (await table.listVersions()).length;
      if (versions !== 1) throw Error("历史清单未全部清理，请再次整理");
      const finalSnapshot = await snapshot(table);
      if (finalSnapshot.rows !== prior.rows || finalSnapshot.fingerprint !== prior.fingerprint) throw new VectorStorageIntegrityError("清理后的向量或片段标识不一致，请保留索引并反馈");
      const after = await storageSize(directory);
      return { policy: VECTOR_STORAGE_POLICY, optimizedAt: Date.now(), beforeBytes: before.bytes, afterBytes: after.bytes,
        reclaimedBytes: Math.max(0, before.bytes - after.bytes), beforeFiles: before.files, afterFiles: after.files, ...prior, versions };
    } finally { table.close(); }
  } finally { connection.close(); }
}
