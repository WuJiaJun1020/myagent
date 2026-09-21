import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { AlgorithmPracticeDatabase } from "./algorithm-practice-database";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createDatabase(): Promise<AlgorithmPracticeDatabase> {
  const directory = await mkdtemp(join(tmpdir(), "pi-algorithm-db-"));
  cleanup.push(directory);
  return new AlgorithmPracticeDatabase(join(directory, "algorithm-practice.db"));
}

describe("AlgorithmPracticeDatabase", () => {
  it("persists drafts, attempts and the best accepted duration", async () => {
    const database = await createDatabase();
    database.saveDraft("two_sum", "leetcode", "draft");
    database.recordSubmission({
      slug: "two_sum",
      mode: "leetcode",
      code: "wrong",
      verdict: "wrong_answer",
      passed: 2,
      total: 6,
      durationMs: 40,
    });
    database.recordSubmission({
      slug: "two_sum",
      mode: "leetcode",
      code: "accepted",
      verdict: "accepted",
      passed: 6,
      total: 6,
      durationMs: 25,
    });
    database.recordSubmission({
      slug: "two_sum",
      mode: "leetcode",
      code: "slower",
      verdict: "accepted",
      passed: 6,
      total: 6,
      durationMs: 80,
    });

    expect(database.getDraft("two_sum", "leetcode")).toBe("draft");
    expect(database.getProgress("two_sum", "leetcode")).toMatchObject({
      solved: true,
      attempts: 3,
      bestTimeMs: 25,
    });
    database.close();
  });

  it("resets only the editor draft and preserves solved progress", async () => {
    const database = await createDatabase();
    database.saveDraft("two_sum", "leetcode", "draft");
    database.recordSubmission({
      slug: "two_sum",
      mode: "leetcode",
      code: "accepted",
      verdict: "accepted",
      passed: 6,
      total: 6,
      durationMs: 12,
    });

    database.resetDraft("two_sum", "leetcode");

    expect(database.getDraft("two_sum", "leetcode")).toBeUndefined();
    expect(database.getProgress("two_sum", "leetcode")).toMatchObject({
      solved: true,
      attempts: 1,
      bestTimeMs: 12,
    });
    database.close();
  });
});
