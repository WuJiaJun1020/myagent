import { randomInt } from "node:crypto";
import type { InterviewAlgorithmMode, InterviewAlgorithmProblem } from "../../shared/contracts/interview";
import type { AlgorithmRuntimeInfo, AlgorithmVerdict } from "../../shared/contracts/algorithm-practice";
import { AlgorithmCatalog } from "../algorithm/algorithm-catalog";
import { PythonAlgorithmRunner, type PythonAlgorithmRunnerPort } from "../algorithm/python-algorithm-runner";

export type InterviewAlgorithmExecution = {
  verdict: AlgorithmVerdict;
  passed: number;
  total: number;
  durationMs: number;
};

export interface InterviewAlgorithmExecutor {
  pickProblem(): InterviewAlgorithmProblem;
  getRuntimeInfo(): Promise<AlgorithmRuntimeInfo>;
  run(slug: string, mode: InterviewAlgorithmMode, code: string): Promise<InterviewAlgorithmExecution>;
  close(): Promise<void> | void;
}

/** Reuses the existing catalog and Python judge, never its global practice drafts or progress. */
export class LocalInterviewAlgorithmExecutor implements InterviewAlgorithmExecutor {
  private readonly catalog: AlgorithmCatalog;
  private readonly runner: PythonAlgorithmRunnerPort;

  constructor(resourceDirectory: string, runner?: PythonAlgorithmRunnerPort) {
    this.catalog = new AlgorithmCatalog(resourceDirectory);
    this.runner = runner ?? new PythonAlgorithmRunner({ resourceDirectory });
  }

  pickProblem(): InterviewAlgorithmProblem {
    if (this.catalog.problems.length === 0) throw new Error("算法题库为空");
    const summary = this.catalog.problems[randomInt(this.catalog.problems.length)];
    const detail = this.catalog.getProblem(summary.slug);
    // Explicit allow-list: reference solutions and judge cases must not cross IPC.
    return {
      slug: detail.slug,
      title: detail.title,
      difficulty: detail.difficulty,
      description: detail.description,
      constraints: detail.constraints,
      examples: detail.examples.map((example) => ({
        leetcodeInput: example.leetcodeInput,
        output: example.output,
        acmStdin: example.acmStdin,
        acmStdout: example.acmStdout,
        explanation: example.explanation,
        ...(example.imageDataUrl ? { imageDataUrl: example.imageDataUrl } : {}),
      })),
      leetcode: detail.leetcode,
      acm: detail.acm,
      templates: detail.templates,
    };
  }

  getRuntimeInfo(): Promise<AlgorithmRuntimeInfo> {
    return this.runner.getRuntimeInfo();
  }

  async run(slug: string, mode: InterviewAlgorithmMode, code: string): Promise<InterviewAlgorithmExecution> {
    if (!this.catalog.hasProblem(slug)) throw new Error("面试算法题已不在题库中");
    const result = await this.runner.run({ slug, mode, code });
    return { verdict: result.verdict, passed: result.passed, total: result.total, durationMs: result.durationMs };
  }

  close(): Promise<void> | void {
    return this.runner.close();
  }
}
