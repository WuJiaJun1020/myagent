import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  AlgorithmMode,
  AlgorithmModeProgress,
  AlgorithmPracticeSnapshot,
  AlgorithmProblemDetail,
  AlgorithmResetDraftRequest,
  AlgorithmRunRequest,
  AlgorithmRunResult,
  AlgorithmSaveDraftRequest,
} from "../../shared/contracts/algorithm-practice";
import { AlgorithmCatalog } from "./algorithm-catalog";
import { AlgorithmPracticeDatabase, attachSubmission } from "./algorithm-practice-database";
import {
  PythonAlgorithmRunner,
  type PythonAlgorithmRunnerPort,
} from "./python-algorithm-runner";

const SAFE_SLUG = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const MODES = new Set<AlgorithmMode>(["leetcode", "acm"]);
const MAX_CODE_CHARACTERS = 200_000;

export type AlgorithmPracticeServiceOptions = {
  dataDirectory: string;
  resourceDirectory: string;
  configuredPythonPath?: string;
  catalog?: AlgorithmCatalog;
  database?: AlgorithmPracticeDatabase;
  runner?: PythonAlgorithmRunnerPort;
};

function emptyProgress(): AlgorithmModeProgress {
  return { solved: false, attempts: 0 };
}

function requestObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 格式无效`);
  return value as Record<string, unknown>;
}

function modeValue(value: unknown): AlgorithmMode {
  if (typeof value !== "string" || !MODES.has(value as AlgorithmMode)) throw new Error("算法练习模式无效");
  return value as AlgorithmMode;
}

function slugValue(value: unknown): string {
  if (typeof value !== "string" || !SAFE_SLUG.test(value) || value.length > 128) throw new Error("算法题 slug 无效");
  return value;
}

function codeValue(value: unknown): string {
  if (typeof value !== "string") throw new Error("算法代码必须是字符串");
  if (value.length > MAX_CODE_CHARACTERS) throw new Error(`算法代码不能超过 ${MAX_CODE_CHARACTERS.toLocaleString()} 个字符`);
  return value;
}

export class AlgorithmPracticeService {
  private readonly catalog: AlgorithmCatalog;
  private readonly database: AlgorithmPracticeDatabase;
  private readonly runner: PythonAlgorithmRunnerPort;
  private closed = false;

  constructor(options: AlgorithmPracticeServiceOptions) {
    this.catalog = options.catalog ?? new AlgorithmCatalog(options.resourceDirectory);
    this.database = options.database ?? new AlgorithmPracticeDatabase(join(options.dataDirectory, "algorithm-practice.db"));
    this.runner = options.runner ?? new PythonAlgorithmRunner({
      resourceDirectory: options.resourceDirectory,
      configuredPythonPath: options.configuredPythonPath,
    });
  }

  async getSnapshot(): Promise<AlgorithmPracticeSnapshot> {
    this.assertOpen();
    const allProgress = this.database.getAllProgress();
    const solved: Record<AlgorithmMode, number> = { leetcode: 0, acm: 0 };
    const problems = this.catalog.problems.map((problem) => {
      const leetcode = allProgress.get(`${problem.slug}:leetcode`) ?? emptyProgress();
      const acm = allProgress.get(`${problem.slug}:acm`) ?? emptyProgress();
      if (leetcode.solved) solved.leetcode += 1;
      if (acm.solved) solved.acm += 1;
      return {
        ...structuredClone(problem),
        progress: { leetcode, acm },
      };
    });
    return {
      collection: structuredClone(this.catalog.collection),
      categories: structuredClone(this.catalog.categories),
      problems,
      runtime: await this.runner.getRuntimeInfo(),
      solved,
    };
  }

  getProblem(value: unknown): AlgorithmProblemDetail {
    this.assertOpen();
    const slug = slugValue(value);
    this.requireProblem(slug);
    const problem = this.catalog.getProblem(slug);
    return {
      ...problem,
      drafts: {
        leetcode: this.database.getDraft(slug, "leetcode") ?? problem.templates.leetcode,
        acm: this.database.getDraft(slug, "acm") ?? problem.templates.acm,
      },
      progress: {
        leetcode: this.database.getProgress(slug, "leetcode"),
        acm: this.database.getProgress(slug, "acm"),
      },
    };
  }

  saveDraft(value: unknown): void {
    this.assertOpen();
    const request = this.parseSaveRequest(value);
    this.database.saveDraft(request.slug, request.mode, request.code);
  }

  resetDraft(value: unknown): void {
    this.assertOpen();
    const request = requestObject(value, "重置草稿请求");
    const slug = slugValue(request.slug);
    const mode = modeValue(request.mode);
    this.requireProblem(slug);
    this.database.resetDraft(slug, mode);
  }

  async run(value: unknown): Promise<AlgorithmRunResult> {
    this.assertOpen();
    const raw = requestObject(value, "运行请求");
    const request = this.parseSaveRequest(raw);
    const answerFile = raw.answerFile;
    if (answerFile != null && (typeof answerFile !== "string" || !answerFile.trim())) {
      throw new Error("参考答案文件无效");
    }

    let code = request.code;
    const isReferenceRun = typeof answerFile === "string";
    if (isReferenceRun) {
      const answer = this.catalog.getAnswer(request.slug, request.mode, answerFile);
      if (!answer) throw new Error("参考答案不存在或与当前模式不匹配");
      // The trusted catalog is authoritative. Never execute caller-supplied
      // "answer" code under a legitimate answer file name.
      code = answer.code;
    } else {
      this.database.saveDraft(request.slug, request.mode, code);
    }

    const execution = await this.runner.run({ slug: request.slug, mode: request.mode, code });
    if (isReferenceRun || execution.verdict === "runtime_unavailable" || execution.verdict === "internal_error") {
      return {
        ...execution,
        submissionId: `${isReferenceRun ? "reference" : "local"}:${randomUUID()}`,
        slug: request.slug,
        mode: request.mode,
        progress: this.database.getProgress(request.slug, request.mode),
      };
    }

    const submission = this.database.recordSubmission({
      slug: request.slug,
      mode: request.mode,
      code,
      verdict: execution.verdict,
      passed: execution.passed,
      total: execution.total,
      durationMs: execution.durationMs,
      error: execution.error,
    });
    return attachSubmission({
      ...execution,
      slug: request.slug,
      mode: request.mode,
    }, submission);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    let runnerError: unknown;
    try {
      await this.runner.close();
    } catch (error) {
      runnerError = error;
    }
    this.database.close();
    if (runnerError) throw runnerError;
  }

  private parseSaveRequest(value: unknown): AlgorithmSaveDraftRequest {
    const request = requestObject(value, "算法草稿请求");
    const parsed: AlgorithmSaveDraftRequest = {
      slug: slugValue(request.slug),
      mode: modeValue(request.mode),
      code: codeValue(request.code),
    };
    this.requireProblem(parsed.slug);
    return parsed;
  }

  private requireProblem(slug: string): void {
    if (!this.catalog.hasProblem(slug)) throw new Error(`未找到算法题: ${slug}`);
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("算法练习服务已关闭");
  }
}

export type AlgorithmPracticeServicePort = Pick<
  AlgorithmPracticeService,
  "getSnapshot" | "getProblem" | "saveDraft" | "resetDraft" | "run" | "close"
>;

// Keep request types reachable for service consumers without widening the IPC
// handlers to trust renderer input.
export type { AlgorithmResetDraftRequest, AlgorithmRunRequest };
