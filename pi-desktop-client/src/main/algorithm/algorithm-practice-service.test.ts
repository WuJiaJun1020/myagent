import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlgorithmMode, AlgorithmRuntimeInfo } from "../../shared/contracts/algorithm-practice";
import { AlgorithmPracticeService } from "./algorithm-practice-service";
import type { AlgorithmExecutionResult, PythonAlgorithmRunnerPort } from "./python-algorithm-runner";

const cleanup: string[] = [];
const resourceDirectory = join(process.cwd(), "resources", "algorithm-practice");

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function accepted(): AlgorithmExecutionResult {
  return {
    verdict: "accepted",
    passed: 6,
    total: 6,
    durationMs: 8,
    cases: [],
  };
}

async function createService(result = accepted()) {
  const dataDirectory = await mkdtemp(join(tmpdir(), "pi-algorithm-service-"));
  cleanup.push(dataDirectory);
  const run = vi.fn(async (_request: { slug: string; mode: AlgorithmMode; code: string }) => result);
  const runtime: AlgorithmRuntimeInfo = {
    available: true,
    source: "embedded",
    displayName: "内置 Python",
    version: "3.12.10",
  };
  const runner: PythonAlgorithmRunnerPort = {
    getRuntimeInfo: vi.fn(async () => runtime),
    run,
    close: vi.fn(),
  };
  const service = new AlgorithmPracticeService({ dataDirectory, resourceDirectory, runner });
  return { service, runner, run };
}

describe("AlgorithmPracticeService", () => {
  it("combines catalog data, independent drafts and persisted progress", async () => {
    const { service } = await createService();
    service.saveDraft({ slug: "two_sum", mode: "leetcode", code: "my draft" });

    const result = await service.run({ slug: "two_sum", mode: "leetcode", code: "accepted code" });
    expect(result).toMatchObject({ verdict: "accepted", progress: { solved: true, attempts: 1 } });
    expect(service.getProblem("two_sum").drafts).toMatchObject({ leetcode: "accepted code" });
    const snapshot = await service.getSnapshot();
    expect(snapshot.problems).toHaveLength(100);
    expect(snapshot.solved.leetcode).toBe(1);
    expect(snapshot.runtime).toMatchObject({ available: true, version: "3.12.10" });
    await service.close();
  });

  it("runs only the trusted reference answer without changing drafts or progress", async () => {
    const { service, run } = await createService();
    service.saveDraft({ slug: "two_sum", mode: "leetcode", code: "keep this draft" });

    const result = await service.run({
      slug: "two_sum",
      mode: "leetcode",
      code: "raise RuntimeError('caller supplied')",
      answerFile: "leetcode_hash.py",
    });

    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      slug: "two_sum",
      mode: "leetcode",
      code: expect.stringContaining("class Solution"),
    }));
    expect(run.mock.calls[0]?.[0].code).not.toContain("caller supplied");
    expect(result.submissionId).toMatch(/^reference:/);
    expect(result.progress).toEqual({ solved: false, attempts: 0 });
    expect(service.getProblem("two_sum").drafts.leetcode).toBe("keep this draft");
    await service.close();
  });

  it("does not count missing-runtime failures as attempts", async () => {
    const { service } = await createService({
      verdict: "runtime_unavailable",
      passed: 0,
      total: 0,
      durationMs: 0,
      cases: [],
      error: "missing",
    });
    const result = await service.run({ slug: "two_sum", mode: "acm", code: "print(1)" });
    expect(result.progress).toEqual({ solved: false, attempts: 0 });
    expect(service.getProblem("two_sum").drafts.acm).toBe("print(1)");
    await service.close();
  });

  it("validates IPC-shaped input before touching the database or runner", async () => {
    const { service, run } = await createService();
    await expect(service.run({ slug: "../two_sum", mode: "leetcode", code: "pass" }))
      .rejects.toThrow("slug");
    await expect(service.run({ slug: "two_sum", mode: "javascript", code: "pass" }))
      .rejects.toThrow("模式");
    await expect(service.run({ slug: "not_a_problem", mode: "leetcode", code: "pass" }))
      .rejects.toThrow("未找到");
    expect(run).not.toHaveBeenCalled();
    await service.close();
  });
});
