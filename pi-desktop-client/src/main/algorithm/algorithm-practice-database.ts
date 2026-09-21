import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  AlgorithmMode,
  AlgorithmModeProgress,
  AlgorithmRunResult,
  AlgorithmVerdict,
} from "../../shared/contracts/algorithm-practice";

type ProgressRow = {
  problem_slug: string;
  mode: string;
  solved: number;
  attempts: number;
  best_time_ms: number | null;
  solved_at: string | null;
};

const SCHEMA_VERSION = 1;

function emptyProgress(): AlgorithmModeProgress {
  return { solved: false, attempts: 0 };
}

function mapProgress(row: ProgressRow | undefined): AlgorithmModeProgress {
  if (!row) return emptyProgress();
  return {
    solved: row.solved === 1,
    attempts: row.attempts,
    ...(row.best_time_ms === null ? {} : { bestTimeMs: row.best_time_ms }),
    ...(row.solved_at ? { solvedAt: row.solved_at } : {}),
  };
}

export class AlgorithmPracticeDatabase {
  private readonly database: DatabaseSync;
  private closed = false;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  getAllProgress(): Map<string, AlgorithmModeProgress> {
    const rows = this.database.prepare(`
      SELECT problem_slug, mode, solved, attempts, best_time_ms, solved_at
      FROM algorithm_progress
    `).all() as unknown as ProgressRow[];
    return new Map(rows.map((row) => [`${row.problem_slug}:${row.mode}`, mapProgress(row)]));
  }

  getProgress(slug: string, mode: AlgorithmMode): AlgorithmModeProgress {
    const row = this.database.prepare(`
      SELECT problem_slug, mode, solved, attempts, best_time_ms, solved_at
      FROM algorithm_progress WHERE problem_slug = ? AND mode = ?
    `).get(slug, mode) as unknown as ProgressRow | undefined;
    return mapProgress(row);
  }

  getDraft(slug: string, mode: AlgorithmMode): string | undefined {
    const row = this.database.prepare(`
      SELECT code FROM algorithm_drafts WHERE problem_slug = ? AND mode = ?
    `).get(slug, mode) as { code: string } | undefined;
    return row?.code;
  }

  saveDraft(slug: string, mode: AlgorithmMode, code: string): void {
    this.database.prepare(`
      INSERT INTO algorithm_drafts(problem_slug, mode, code, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(problem_slug, mode) DO UPDATE SET
        code = excluded.code,
        updated_at = excluded.updated_at
    `).run(slug, mode, code, new Date().toISOString());
  }

  resetDraft(slug: string, mode: AlgorithmMode): void {
    // Resetting the editor is not the same operation as resetting learning
    // history.  A solved problem must stay solved when the user restores the
    // starter template.
    this.database.prepare("DELETE FROM algorithm_drafts WHERE problem_slug = ? AND mode = ?").run(slug, mode);
  }

  recordSubmission(input: {
    slug: string;
    mode: AlgorithmMode;
    code: string;
    verdict: AlgorithmVerdict;
    passed: number;
    total: number;
    durationMs: number;
    error?: string;
  }): { submissionId: string; progress: AlgorithmModeProgress } {
    const submissionId = randomUUID();
    const now = new Date().toISOString();
    const accepted = input.verdict === "accepted";
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`
        INSERT INTO algorithm_submissions(
          id, problem_slug, mode, code, verdict, passed, total, duration_ms, error_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        submissionId,
        input.slug,
        input.mode,
        input.code,
        input.verdict,
        input.passed,
        input.total,
        Math.max(0, Math.round(input.durationMs)),
        input.error?.slice(0, 4_000) ?? null,
        now,
      );
      this.database.prepare(`
        INSERT INTO algorithm_progress(problem_slug, mode, solved, attempts, best_time_ms, solved_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(problem_slug, mode) DO UPDATE SET
          solved = CASE WHEN excluded.solved = 1 THEN 1 ELSE algorithm_progress.solved END,
          attempts = algorithm_progress.attempts + 1,
          best_time_ms = CASE
            WHEN excluded.solved = 0 THEN algorithm_progress.best_time_ms
            WHEN algorithm_progress.best_time_ms IS NULL THEN excluded.best_time_ms
            ELSE MIN(algorithm_progress.best_time_ms, excluded.best_time_ms)
          END,
          solved_at = CASE
            WHEN algorithm_progress.solved_at IS NOT NULL THEN algorithm_progress.solved_at
            ELSE excluded.solved_at
          END,
          updated_at = excluded.updated_at
      `).run(
        input.slug,
        input.mode,
        accepted ? 1 : 0,
        accepted ? Math.max(0, Math.round(input.durationMs)) : null,
        accepted ? now : null,
        now,
      );
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return { submissionId, progress: this.getProgress(input.slug, input.mode) };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.database.close();
  }

  private migrate(): void {
    const versionRow = this.database.prepare("PRAGMA user_version").get() as
      | { user_version?: number }
      | undefined;
    const current = Number(versionRow?.user_version ?? 0);
    if (current > SCHEMA_VERSION) throw new Error(`算法练习数据库版本 ${current} 高于客户端支持版本 ${SCHEMA_VERSION}`);
    if (current < 1) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS algorithm_drafts (
          problem_slug TEXT NOT NULL,
          mode TEXT NOT NULL CHECK(mode IN ('leetcode', 'acm')),
          code TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY(problem_slug, mode)
        );
        CREATE TABLE IF NOT EXISTS algorithm_progress (
          problem_slug TEXT NOT NULL,
          mode TEXT NOT NULL CHECK(mode IN ('leetcode', 'acm')),
          solved INTEGER NOT NULL DEFAULT 0 CHECK(solved IN (0, 1)),
          attempts INTEGER NOT NULL DEFAULT 0,
          best_time_ms INTEGER,
          solved_at TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY(problem_slug, mode)
        );
        CREATE TABLE IF NOT EXISTS algorithm_submissions (
          id TEXT PRIMARY KEY,
          problem_slug TEXT NOT NULL,
          mode TEXT NOT NULL CHECK(mode IN ('leetcode', 'acm')),
          code TEXT NOT NULL,
          verdict TEXT NOT NULL,
          passed INTEGER NOT NULL,
          total INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL,
          error_summary TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_algorithm_submissions_problem
          ON algorithm_submissions(problem_slug, mode, created_at DESC);
        PRAGMA user_version = 1;
        COMMIT;
      `);
    }
  }
}

export function attachSubmission(
  result: Omit<AlgorithmRunResult, "submissionId" | "progress">,
  submission: { submissionId: string; progress: AlgorithmModeProgress },
): AlgorithmRunResult {
  return { ...result, ...submission };
}
