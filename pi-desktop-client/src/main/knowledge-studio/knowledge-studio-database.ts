import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  KnowledgeArtifactSummary,
  KnowledgeBatchStage,
  KnowledgeBatchStatus,
  KnowledgeGenerationBatch,
  KnowledgeGenerationEvent,
  KnowledgeGenerationBatchSummary,
  KnowledgeGenerationAiSettings,
  KnowledgeHumanReviewStatus,
  KnowledgeQuestionCandidate,
  KnowledgeReviewCandidateRequest,
  KnowledgeSourceDetail,
  KnowledgeSourceSegment,
  KnowledgeSourceSummary,
} from "../../shared/contracts/knowledge-studio";
import { KNOWLEDGE_PARSER_VERSION, type ParsedKnowledgeSource } from "./document-parser";

type Row = Record<string, unknown>;

function text(row: Row, key: string): string {
  return String(row[key] ?? "");
}

function optionalText(row: Row, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" && value ? value : undefined;
}

function integer(row: Row, key: string): number {
  return Number(row[key] ?? 0);
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type StoredCandidate = Omit<KnowledgeQuestionCandidate, "id" | "batchId" | "updatedAt" | "humanStatus">;

export type KnowledgeSourceReference = {
  batchId: string;
  batchTitle: string;
  status: KnowledgeBatchStatus;
  artifactPaths: string[];
};

export type KnowledgeSourceDeletion = {
  deleted: boolean;
  deletedBatchIds: string[];
  artifactPaths: string[];
};

export class KnowledgeStudioDatabase {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    this.migrate();
    this.database.prepare(`
      UPDATE generation_batches
      SET status = 'failed', stage = 'failed', error = '客户端关闭导致任务中断，可以重新生成', updated_at = ?
      WHERE status IN ('queued', 'running')
    `).run(new Date().toISOString());
  }

  close(): void {
    this.database.close();
  }

  addSource(id: string, parsed: ParsedKnowledgeSource, createdAt: string): KnowledgeSourceSummary {
    const existing = this.getSourceByHash(parsed.contentHash);
    if (existing) return existing;
    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO source_documents (
          id, title, kind, format, original_name, source_url, content_hash, content, char_count, parser_version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, parsed.title, parsed.kind, parsed.format, parsed.originalName ?? null, parsed.sourceUrl ?? null,
        parsed.contentHash, parsed.content, parsed.content.length, KNOWLEDGE_PARSER_VERSION, createdAt,
      );
      const statement = this.database.prepare(`
        INSERT INTO source_segments (
          id, document_id, ordinal, heading, content, start_offset, end_offset
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const segment of parsed.segments) {
        statement.run(segment.id, id, segment.ordinal, segment.heading ?? null, segment.content, segment.startOffset, segment.endOffset);
      }
    });
    return this.getSourceSummary(id)!;
  }

  getSourceByHash(hash: string): KnowledgeSourceSummary | null {
    const row = this.database.prepare(`${this.sourceSelect()} WHERE d.content_hash = ?`).get(hash) as Row | undefined;
    return row ? this.mapSource(row) : null;
  }

  listSources(): KnowledgeSourceSummary[] {
    return (this.database.prepare(`${this.sourceSelect()} ORDER BY d.created_at DESC`).all() as Row[]).map((row) => this.mapSource(row));
  }

  getSourceSummary(id: string): KnowledgeSourceSummary | null {
    const row = this.database.prepare(`${this.sourceSelect()} WHERE d.id = ?`).get(id) as Row | undefined;
    return row ? this.mapSource(row) : null;
  }

  getSource(id: string): KnowledgeSourceDetail | null {
    const summary = this.getSourceSummary(id);
    if (!summary) return null;
    const contentRow = this.database.prepare("SELECT content FROM source_documents WHERE id = ?").get(id) as Row | undefined;
    const segments = this.getSegmentsForSources([id]);
    return { ...summary, contentPreview: text(contentRow ?? {}, "content").slice(0, 20_000), segments };
  }

  getSourceContent(id: string): string | null {
    const row = this.database.prepare("SELECT content FROM source_documents WHERE id = ?").get(id) as Row | undefined;
    return row ? text(row, "content") : null;
  }

  listOutdatedUnreferencedHtmlSources(parserVersion: number): KnowledgeSourceSummary[] {
    const rows = this.database.prepare(`${this.sourceSelect()}
      WHERE d.format = 'html' AND d.parser_version < ?
        AND NOT EXISTS (SELECT 1 FROM generation_batch_sources bs WHERE bs.source_id = d.id)
      ORDER BY d.created_at
    `).all(parserVersion) as Row[];
    return rows.map((row) => this.mapSource(row));
  }

  replaceSourceDerivedContent(id: string, parsed: ParsedKnowledgeSource, parserVersion: number): KnowledgeSourceSummary {
    this.transaction(() => {
      const updated = this.database.prepare(`
        UPDATE source_documents
        SET content_hash = ?, content = ?, char_count = ?, parser_version = ?
        WHERE id = ?
      `).run(parsed.contentHash, parsed.content, parsed.content.length, parserVersion, id);
      if (updated.changes === 0) throw new Error("资料不存在");
      this.database.prepare("DELETE FROM source_segments WHERE document_id = ?").run(id);
      const insert = this.database.prepare(`
        INSERT INTO source_segments (
          id, document_id, ordinal, heading, content, start_offset, end_offset
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const segment of parsed.segments) {
        insert.run(segment.id, id, segment.ordinal, segment.heading ?? null, segment.content, segment.startOffset, segment.endOffset);
      }
    });
    return this.getSourceSummary(id)!;
  }

  getSegmentsForSources(sourceIds: string[]): KnowledgeSourceSegment[] {
    if (sourceIds.length === 0) return [];
    const placeholders = sourceIds.map(() => "?").join(", ");
    const rows = this.database.prepare(`
      SELECT id, ordinal, heading, content, start_offset, end_offset
      FROM source_segments WHERE document_id IN (${placeholders})
      ORDER BY document_id, ordinal
    `).all(...sourceIds) as Row[];
    return rows.map((row) => ({
      id: text(row, "id"),
      ordinal: integer(row, "ordinal"),
      ...(optionalText(row, "heading") ? { heading: optionalText(row, "heading") } : {}),
      content: text(row, "content"),
      startOffset: integer(row, "start_offset"),
      endOffset: integer(row, "end_offset"),
    }));
  }

  getSourceReferences(id: string): KnowledgeSourceReference[] {
    const rows = this.database.prepare(`
      SELECT b.id AS batch_id, b.title AS batch_title, b.status,
        (SELECT GROUP_CONCAT(path, char(31)) FROM artifacts a WHERE a.batch_id = b.id) AS artifact_paths
      FROM generation_batches b
      JOIN generation_batch_sources s ON s.batch_id = b.id
      WHERE s.source_id = ?
      ORDER BY b.created_at DESC
    `).all(id) as Row[];
    return rows.map((row) => ({
      batchId: text(row, "batch_id"),
      batchTitle: text(row, "batch_title"),
      status: text(row, "status") as KnowledgeBatchStatus,
      artifactPaths: optionalText(row, "artifact_paths")?.split(String.fromCharCode(31)).filter(Boolean) ?? [],
    }));
  }

  deleteSource(id: string, deleteReferencingBatches = false): KnowledgeSourceDeletion {
    const references = this.getSourceReferences(id);
    if (references.length > 0 && !deleteReferencingBatches) {
      throw new Error(`该资料被 ${references.length} 个生成任务引用；确认后可以连同这些任务和发布产物一起删除`);
    }
    const deletedBatchIds = references.map((reference) => reference.batchId);
    const artifactPaths = references.flatMap((reference) => reference.artifactPaths);
    let deleted = false;
    this.transaction(() => {
      for (const batchId of deletedBatchIds) {
        this.database.prepare("DELETE FROM artifacts WHERE batch_id = ?").run(batchId);
        this.database.prepare("DELETE FROM generation_batches WHERE id = ?").run(batchId);
      }
      deleted = this.database.prepare("DELETE FROM source_documents WHERE id = ?").run(id).changes > 0;
    });
    return { deleted, deletedBatchIds, artifactPaths };
  }

  deleteBatch(id: string): { deleted: boolean; artifactPaths: string[] } {
    const artifactPaths = (this.database.prepare("SELECT path FROM artifacts WHERE batch_id = ? ORDER BY version").all(id) as Row[])
      .map((row) => text(row, "path"))
      .filter(Boolean);
    let deleted = false;
    this.transaction(() => {
      this.database.prepare("DELETE FROM artifacts WHERE batch_id = ?").run(id);
      deleted = this.database.prepare("DELETE FROM generation_batches WHERE id = ?").run(id).changes > 0;
    });
    return { deleted, artifactPaths };
  }

  createBatch(input: {
    id: string;
    title: string;
    targetRole: string;
    questionCount: number;
    difficulty: string;
    sourceIds: string[];
    aiSettings?: KnowledgeGenerationAiSettings;
    createdAt: string;
  }): KnowledgeGenerationBatch {
    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO generation_batches (
          id, title, target_role, requested_question_count, difficulty, ai_settings_json, status, stage, progress, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 'queued', 0, ?, ?)
      `).run(input.id, input.title, input.targetRole, input.questionCount, input.difficulty, input.aiSettings ? JSON.stringify(input.aiSettings) : null, input.createdAt, input.createdAt);
      const link = this.database.prepare("INSERT INTO generation_batch_sources (batch_id, source_id, ordinal) VALUES (?, ?, ?)");
      input.sourceIds.forEach((sourceId, index) => link.run(input.id, sourceId, index));
    });
    return this.getBatch(input.id)!;
  }

  resetBatch(id: string, updatedAt: string): KnowledgeGenerationBatch {
    this.transaction(() => {
      this.database.prepare("DELETE FROM question_candidates WHERE batch_id = ?").run(id);
      this.database.prepare(`
        UPDATE generation_batches SET status = 'queued', stage = 'queued', progress = 0,
        error = NULL, provider_id = NULL, model_id = NULL, usage_json = '{}', updated_at = ?
        WHERE id = ?
      `).run(updatedAt, id);
    });
    const batch = this.getBatch(id);
    if (!batch) throw new Error("生成任务不存在");
    this.addGenerationEvent({ batchId: id, stage: "queued", state: "running", progress: 0,
      message: "重新生成已开始；上一轮调用及失败诊断记录已保留", createdAt: updatedAt });
    return this.getBatch(id)!;
  }

  updateBatchAiSettings(id: string, settings: KnowledgeGenerationAiSettings): void {
    this.database.prepare("UPDATE generation_batches SET ai_settings_json = ? WHERE id = ?").run(JSON.stringify(settings), id);
  }

  updateBatch(id: string, input: {
    status: KnowledgeBatchStatus;
    stage: KnowledgeBatchStage;
    progress: number;
    updatedAt: string;
    error?: string;
    providerId?: string;
    modelId?: string;
    usage?: unknown;
  }): void {
    this.database.prepare(`
      UPDATE generation_batches
      SET status = ?, stage = ?, progress = ?, error = ?, provider_id = COALESCE(?, provider_id),
        model_id = COALESCE(?, model_id), usage_json = COALESCE(?, usage_json), updated_at = ?
      WHERE id = ?
    `).run(
      input.status, input.stage, Math.max(0, Math.min(100, Math.round(input.progress))), input.error ?? null,
      input.providerId ?? null, input.modelId ?? null, input.usage === undefined ? null : JSON.stringify(input.usage),
      input.updatedAt, id,
    );
  }

  replaceCandidates(batchId: string, candidates: StoredCandidate[], updatedAt: string): void {
    this.transaction(() => {
      this.database.prepare("DELETE FROM question_candidates WHERE batch_id = ?").run(batchId);
      const statement = this.database.prepare(`
        INSERT INTO question_candidates (
          id, batch_id, ordinal, kind, difficulty, competency, question, answer, rubric_json,
          pitfalls_json, follow_ups_json, evidence_json, validation_status, validation_notes_json,
          human_status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `);
      for (const candidate of candidates) {
        statement.run(
          `${batchId}:candidate:${candidate.ordinal}`, batchId, candidate.ordinal, candidate.kind,
          candidate.difficulty, candidate.competency, candidate.question, candidate.answer,
          JSON.stringify(candidate.rubric), JSON.stringify(candidate.pitfalls), JSON.stringify(candidate.followUps),
          JSON.stringify(candidate.evidence), candidate.validationStatus, JSON.stringify(candidate.validationNotes), updatedAt,
        );
      }
    });
  }

  listBatches(): KnowledgeGenerationBatchSummary[] {
    return (this.database.prepare(`${this.batchSelect()} ORDER BY b.created_at DESC`).all() as Row[])
      .map((row) => this.mapBatch(row));
  }

  getBatch(id: string): KnowledgeGenerationBatch | null {
    const row = this.database.prepare(`${this.batchSelect()} WHERE b.id = ?`).get(id) as Row | undefined;
    if (!row) return null;
    return { ...this.mapBatch(row), candidates: this.listCandidates(id), events: this.listGenerationEvents(id) };
  }

  addGenerationEvent(input: Omit<KnowledgeGenerationEvent, "id">): KnowledgeGenerationEvent {
    const result = this.database.prepare(`
      INSERT INTO generation_events (
        batch_id, stage, state, progress, message, provider_id, model_id, usage_json, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.batchId, input.stage, input.state, input.progress, input.message,
      input.providerId ?? null, input.modelId ?? null,
      input.usage === undefined ? null : JSON.stringify(input.usage),
      input.details === undefined ? null : JSON.stringify(input.details), input.createdAt,
    );
    return { id: Number(result.lastInsertRowid), ...input };
  }

  reviewCandidate(request: KnowledgeReviewCandidateRequest, updatedAt: string): KnowledgeQuestionCandidate {
    const current = this.getCandidate(request.candidateId);
    if (!current) throw new Error("候选题不存在");
    const rubric = request.rubric ?? current.rubric;
    if (rubric.length === 0 || rubric.reduce((sum, item) => sum + item.weight, 0) !== 100) {
      throw new Error("评分标准不能为空，且权重总和必须为 100");
    }
    this.database.prepare(`
      UPDATE question_candidates SET question = ?, answer = ?, rubric_json = ?, pitfalls_json = ?,
        follow_ups_json = ?, human_status = ?, updated_at = ? WHERE id = ?
    `).run(
      request.question?.trim() || current.question,
      request.answer?.trim() || current.answer,
      JSON.stringify(rubric), JSON.stringify(request.pitfalls ?? current.pitfalls),
      JSON.stringify(request.followUps ?? current.followUps), request.status, updatedAt, request.candidateId,
    );
    return this.getCandidate(request.candidateId)!;
  }

  getCandidate(id: string): KnowledgeQuestionCandidate | null {
    const row = this.database.prepare("SELECT * FROM question_candidates WHERE id = ?").get(id) as Row | undefined;
    return row ? this.mapCandidate(row) : null;
  }

  createArtifact(artifact: KnowledgeArtifactSummary): void {
    this.database.prepare(`
      INSERT INTO artifacts (id, batch_id, version, path, content_hash, question_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(artifact.id, artifact.batchId, artifact.version, artifact.path, artifact.contentHash, artifact.questionCount, artifact.createdAt);
  }

  nextArtifactVersion(batchId: string): number {
    const row = this.database.prepare("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM artifacts WHERE batch_id = ?").get(batchId) as Row;
    return integer(row, "version");
  }

  private listCandidates(batchId: string): KnowledgeQuestionCandidate[] {
    return (this.database.prepare("SELECT * FROM question_candidates WHERE batch_id = ? ORDER BY ordinal").all(batchId) as Row[])
      .map((row) => this.mapCandidate(row));
  }

  private listGenerationEvents(batchId: string): KnowledgeGenerationEvent[] {
    return (this.database.prepare("SELECT * FROM generation_events WHERE batch_id = ? ORDER BY id").all(batchId) as Row[])
      .map((row) => ({
        id: integer(row, "id"),
        batchId: text(row, "batch_id"),
        stage: text(row, "stage") as KnowledgeGenerationEvent["stage"],
        state: text(row, "state") as KnowledgeGenerationEvent["state"],
        progress: integer(row, "progress"),
        message: text(row, "message"),
        ...(optionalText(row, "provider_id") ? { providerId: optionalText(row, "provider_id") } : {}),
        ...(optionalText(row, "model_id") ? { modelId: optionalText(row, "model_id") } : {}),
        ...(optionalText(row, "usage_json") ? { usage: json(row.usage_json, {}) } : {}),
        ...(optionalText(row, "details_json") ? { details: json(row.details_json, {}) as KnowledgeGenerationEvent["details"] } : {}),
        createdAt: text(row, "created_at"),
      }));
  }

  private mapCandidate(row: Row): KnowledgeQuestionCandidate {
    return {
      id: text(row, "id"), batchId: text(row, "batch_id"), ordinal: integer(row, "ordinal"),
      kind: text(row, "kind") as KnowledgeQuestionCandidate["kind"],
      difficulty: text(row, "difficulty") as KnowledgeQuestionCandidate["difficulty"],
      competency: text(row, "competency"), question: text(row, "question"), answer: text(row, "answer"),
      rubric: json(row.rubric_json, []), pitfalls: json(row.pitfalls_json, []), followUps: json(row.follow_ups_json, []),
      evidence: json(row.evidence_json, []),
      validationStatus: text(row, "validation_status") as KnowledgeQuestionCandidate["validationStatus"],
      validationNotes: json(row.validation_notes_json, []),
      humanStatus: text(row, "human_status") as KnowledgeHumanReviewStatus,
      updatedAt: text(row, "updated_at"),
    };
  }

  private sourceSelect(): string {
    return `SELECT d.id, d.title, d.kind, d.format, d.original_name, d.source_url, d.content_hash,
      d.char_count, d.created_at,
      (SELECT COUNT(*) FROM source_segments s WHERE s.document_id = d.id) AS segment_count
      FROM source_documents d`;
  }

  private mapSource(row: Row): KnowledgeSourceSummary {
    return {
      id: text(row, "id"), title: text(row, "title"), kind: text(row, "kind") as KnowledgeSourceSummary["kind"],
      format: text(row, "format") as KnowledgeSourceSummary["format"],
      ...(optionalText(row, "original_name") ? { originalName: optionalText(row, "original_name") } : {}),
      ...(optionalText(row, "source_url") ? { sourceUrl: optionalText(row, "source_url") } : {}),
      contentHash: text(row, "content_hash"), charCount: integer(row, "char_count"),
      segmentCount: integer(row, "segment_count"), createdAt: text(row, "created_at"),
    };
  }

  private batchSelect(): string {
    return `SELECT b.*,
      (SELECT COUNT(*) FROM question_candidates c WHERE c.batch_id = b.id) AS candidate_count,
      (SELECT COUNT(*) FROM question_candidates c WHERE c.batch_id = b.id AND c.human_status = 'approved') AS approved_count,
      (SELECT COUNT(*) FROM question_candidates c WHERE c.batch_id = b.id AND c.human_status = 'rejected') AS rejected_count,
      (SELECT GROUP_CONCAT(source_id) FROM (
        SELECT source_id FROM generation_batch_sources s WHERE s.batch_id = b.id ORDER BY s.ordinal
      )) AS source_ids,
      a.id AS artifact_id, a.version AS artifact_version, a.path AS artifact_path,
      a.content_hash AS artifact_hash, a.question_count AS artifact_question_count, a.created_at AS artifact_created_at
      FROM generation_batches b
      LEFT JOIN artifacts a ON a.id = (SELECT id FROM artifacts WHERE batch_id = b.id ORDER BY version DESC LIMIT 1)
      `;
  }

  private mapBatch(row: Row): KnowledgeGenerationBatchSummary {
    const artifactId = optionalText(row, "artifact_id");
    const artifact: KnowledgeArtifactSummary | undefined = artifactId ? {
      id: artifactId, batchId: text(row, "id"), version: integer(row, "artifact_version"),
      path: text(row, "artifact_path"), contentHash: text(row, "artifact_hash"),
      questionCount: integer(row, "artifact_question_count"), createdAt: text(row, "artifact_created_at"),
    } : undefined;
    return {
      id: text(row, "id"), title: text(row, "title"), targetRole: text(row, "target_role"),
      difficulty: text(row, "difficulty") as KnowledgeGenerationBatchSummary["difficulty"],
      requestedQuestionCount: integer(row, "requested_question_count"),
      sourceIds: optionalText(row, "source_ids")?.split(",").filter(Boolean) ?? [],
      ...(optionalText(row, "ai_settings_json") ? { aiSettings: json<KnowledgeGenerationAiSettings | undefined>(row.ai_settings_json, undefined) } : {}),
      status: text(row, "status") as KnowledgeBatchStatus, stage: text(row, "stage") as KnowledgeBatchStage,
      progress: integer(row, "progress"), ...(optionalText(row, "error") ? { error: optionalText(row, "error") } : {}),
      ...(optionalText(row, "provider_id") ? { providerId: optionalText(row, "provider_id") } : {}),
      ...(optionalText(row, "model_id") ? { modelId: optionalText(row, "model_id") } : {}),
      candidateCount: integer(row, "candidate_count"), approvedCount: integer(row, "approved_count"),
      rejectedCount: integer(row, "rejected_count"), createdAt: text(row, "created_at"), updatedAt: text(row, "updated_at"),
      ...(artifact ? { artifact } : {}),
    };
  }

  private transaction(operation: () => void): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      operation();
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS source_documents (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, format TEXT NOT NULL,
        original_name TEXT, source_url TEXT, content_hash TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
        char_count INTEGER NOT NULL, parser_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS source_segments (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL, heading TEXT, content TEXT NOT NULL, start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL, UNIQUE(document_id, ordinal)
      );
      CREATE TABLE IF NOT EXISTS generation_batches (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, target_role TEXT NOT NULL,
        requested_question_count INTEGER NOT NULL, difficulty TEXT NOT NULL, status TEXT NOT NULL,
        stage TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, error TEXT, provider_id TEXT,
        model_id TEXT, usage_json TEXT NOT NULL DEFAULT '{}', ai_settings_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS generation_batch_sources (
        batch_id TEXT NOT NULL REFERENCES generation_batches(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL REFERENCES source_documents(id), ordinal INTEGER NOT NULL,
        PRIMARY KEY(batch_id, source_id)
      );
      CREATE TABLE IF NOT EXISTS question_candidates (
        id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES generation_batches(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL, kind TEXT NOT NULL, difficulty TEXT NOT NULL, competency TEXT NOT NULL,
        question TEXT NOT NULL, answer TEXT NOT NULL, rubric_json TEXT NOT NULL, pitfalls_json TEXT NOT NULL,
        follow_ups_json TEXT NOT NULL, evidence_json TEXT NOT NULL, validation_status TEXT NOT NULL,
        validation_notes_json TEXT NOT NULL, human_status TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(batch_id, ordinal)
      );
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES generation_batches(id), version INTEGER NOT NULL,
        path TEXT NOT NULL, content_hash TEXT NOT NULL, question_count INTEGER NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(batch_id, version)
      );
      CREATE TABLE IF NOT EXISTS generation_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL REFERENCES generation_batches(id) ON DELETE CASCADE,
        stage TEXT NOT NULL, state TEXT NOT NULL, progress INTEGER NOT NULL,
        message TEXT NOT NULL, provider_id TEXT, model_id TEXT, usage_json TEXT, details_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS generation_events_batch_id ON generation_events(batch_id, id);
    `);
    const sourceColumns = this.database.prepare("PRAGMA table_info(source_documents)").all() as Row[];
    if (!sourceColumns.some((row) => text(row, "name") === "parser_version")) {
      this.database.exec("ALTER TABLE source_documents ADD COLUMN parser_version INTEGER NOT NULL DEFAULT 1");
    }
    const eventColumns = this.database.prepare("PRAGMA table_info(generation_events)").all() as Row[];
    if (!eventColumns.some((row) => text(row, "name") === "details_json")) {
      this.database.exec("ALTER TABLE generation_events ADD COLUMN details_json TEXT");
    }
    const batchColumns = this.database.prepare("PRAGMA table_info(generation_batches)").all() as Row[];
    if (!batchColumns.some((row) => text(row, "name") === "ai_settings_json")) {
      this.database.exec("ALTER TABLE generation_batches ADD COLUMN ai_settings_json TEXT");
    }
    this.database.exec("PRAGMA user_version = 5");
  }
}
