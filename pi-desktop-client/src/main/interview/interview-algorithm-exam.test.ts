import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PythonAlgorithmRunnerPort } from "../algorithm/python-algorithm-runner";
import { LocalInterviewAlgorithmExecutor } from "./interview-algorithm-exam";

describe("LocalInterviewAlgorithmExecutor", () => {
  it("returns only public question fields and strips per-case judge details", async () => {
    const runner: PythonAlgorithmRunnerPort = {
      getRuntimeInfo: vi.fn(async () => ({ available: true, source: "embedded" as const, displayName: "Python" })),
      run: vi.fn(async () => ({ verdict: "accepted" as const, passed: 2, total: 2, durationMs: 10,
        cases: [{ index: 1, ok: true, input: "secret input", expected: "secret output",
          actual: "secret output", timeMs: 5 }] })),
      close: vi.fn(),
    };
    const executor = new LocalInterviewAlgorithmExecutor(join(process.cwd(), "resources", "algorithm-practice"), runner);
    const problem = executor.pickProblem();
    expect(problem.slug).toBeTruthy();
    expect(problem.templates.leetcode).toBeTypeOf("string");
    expect(problem.templates.acm).toBeTypeOf("string");
    expect(problem).not.toHaveProperty("answers");
    expect(problem).not.toHaveProperty("test_cases");
    const result = await executor.run(problem.slug, "leetcode", "print(1)");
    expect(result).toEqual({ verdict: "accepted", passed: 2, total: 2, durationMs: 10 });
    expect(JSON.stringify(result)).not.toContain("secret input");
    await executor.close();
  });
});
