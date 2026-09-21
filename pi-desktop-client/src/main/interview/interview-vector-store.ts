import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import type {
  InterviewVectorMatch,
  InterviewVectorQuery,
  InterviewVectorRecord,
} from "../../shared/contracts/interview";

export interface InterviewVectorStore {
  upsert(records: InterviewVectorRecord[]): Promise<void>;
  search(query: InterviewVectorQuery): Promise<InterviewVectorMatch[]>;
  deleteByDocument(documentId: string): Promise<void>;
  deleteByInterview(interviewId: string): Promise<void>;
  close(): Promise<void> | void;
}

type LanceDbModule = typeof import("@lancedb/lancedb");
type LanceConnection = Awaited<ReturnType<LanceDbModule["connect"]>>;

function tableName(model: string, dimensions: number): string {
  const digest = createHash("sha256").update(`${model}:${dimensions}`, "utf8").digest("hex").slice(0, 16);
  return `interview_chunks_${digest}`;
}

function escapeSql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function assertVector(vector: number[], dimensions: number): void {
  if (!Number.isInteger(dimensions) || dimensions <= 0 || vector.length !== dimensions) {
    throw new Error(`向量维度不匹配：预期 ${dimensions}，实际 ${vector.length}`);
  }
  if (!vector.every(Number.isFinite)) throw new Error("向量包含无效数值");
}

export class LanceDbInterviewVectorStore implements InterviewVectorStore {
  private connectionPromise?: Promise<LanceConnection>;

  constructor(private readonly directory: string) {}

  async upsert(records: InterviewVectorRecord[]): Promise<void> {
    if (records.length === 0) return;
    const groups = new Map<string, InterviewVectorRecord[]>();
    for (const record of records) {
      assertVector(record.vector, record.dimensions);
      if (!record.id || !record.interviewId || !record.documentId || !record.model) {
        throw new Error("向量记录缺少必要标识");
      }
      const name = tableName(record.model, record.dimensions);
      const group = groups.get(name) ?? [];
      group.push(record);
      groups.set(name, group);
    }

    const connection = await this.getConnection();
    const existing = new Set(await connection.tableNames());
    for (const [name, group] of groups) {
      const rows = group.map((record) => ({
        id: record.id,
        interviewId: record.interviewId,
        documentId: record.documentId,
        content: record.content,
        model: record.model,
        dimensions: record.dimensions,
        vector: record.vector,
        updatedAt: record.updatedAt,
      }));
      if (!existing.has(name)) {
        await connection.createTable(name, rows, { mode: "create" });
        existing.add(name);
        continue;
      }
      const table = await connection.openTable(name);
      await table.mergeInsert("id")
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute(rows);
    }
  }

  async search(query: InterviewVectorQuery): Promise<InterviewVectorMatch[]> {
    assertVector(query.vector, query.dimensions);
    const limit = Math.max(1, Math.min(100, Math.trunc(query.limit ?? 8)));
    const connection = await this.getConnection();
    const name = tableName(query.model, query.dimensions);
    if (!(await connection.tableNames()).includes(name)) return [];

    const table = await connection.openTable(name);
    let search = table.vectorSearch(query.vector).limit(limit);
    const predicates: string[] = [];
    if (query.interviewId) predicates.push(`interviewId = ${escapeSql(query.interviewId)}`);
    if (query.documentId) predicates.push(`documentId = ${escapeSql(query.documentId)}`);
    if (predicates.length > 0) search = search.where(predicates.join(" AND "));
    const rows = await search.toArray() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      interviewId: String(row.interviewId),
      documentId: String(row.documentId),
      content: String(row.content),
      model: String(row.model),
      dimensions: Number(row.dimensions),
      updatedAt: String(row.updatedAt),
      distance: Number(row._distance),
    }));
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.deleteWhere(`documentId = ${escapeSql(documentId)}`);
  }

  async deleteByInterview(interviewId: string): Promise<void> {
    await this.deleteWhere(`interviewId = ${escapeSql(interviewId)}`);
  }

  async close(): Promise<void> {
    if (!this.connectionPromise) return;
    const connectionPromise = this.connectionPromise;
    this.connectionPromise = undefined;
    const connection = await connectionPromise;
    await connection.close();
  }

  private async deleteWhere(predicate: string): Promise<void> {
    const connection = await this.getConnection();
    const names = (await connection.tableNames()).filter((name) => name.startsWith("interview_chunks_"));
    await Promise.all(names.map(async (name) => {
      const table = await connection.openTable(name);
      await table.delete(predicate);
    }));
  }

  private getConnection(): Promise<LanceConnection> {
    if (!this.connectionPromise) {
      this.connectionPromise = mkdir(this.directory, { recursive: true })
        .then(() => import("@lancedb/lancedb"))
        .then((lanceDb) => lanceDb.connect(this.directory));
    }
    return this.connectionPromise;
  }
}
