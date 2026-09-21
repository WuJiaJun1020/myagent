import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { LanceDbInterviewVectorStore } from "./interview-vector-store";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("LanceDbInterviewVectorStore", () => {
  it("upserts, filters, and deletes interview-scoped vectors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-interview-vectors-"));
    cleanup.push(directory);
    const store = new LanceDbInterviewVectorStore(directory);
    const now = new Date().toISOString();
    await store.upsert([
      {
        id: "chunk-a",
        interviewId: "interview-a",
        documentId: "document-a",
        content: "TypeScript 服务端开发",
        model: "test-embedding",
        dimensions: 3,
        vector: [1, 0, 0],
        updatedAt: now,
      },
      {
        id: "chunk-b",
        interviewId: "interview-b",
        documentId: "document-b",
        content: "数据库事务设计",
        model: "test-embedding",
        dimensions: 3,
        vector: [0, 1, 0],
        updatedAt: now,
      },
    ]);

    const matches = await store.search({
      model: "test-embedding",
      dimensions: 3,
      vector: [0.9, 0.1, 0],
      interviewId: "interview-a",
      limit: 5,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ id: "chunk-a", interviewId: "interview-a" });

    await store.upsert([{
      id: "chunk-a",
      interviewId: "interview-a",
      documentId: "document-a",
      content: "更新后的 TypeScript 项目经验",
      model: "test-embedding",
      dimensions: 3,
      vector: [0.95, 0.05, 0],
      updatedAt: now,
    }]);
    const updated = await store.search({
      model: "test-embedding",
      dimensions: 3,
      vector: [1, 0, 0],
      interviewId: "interview-a",
    });
    expect(updated).toHaveLength(1);
    expect(updated[0]?.content).toBe("更新后的 TypeScript 项目经验");

    await store.deleteByInterview("interview-a");
    expect(await store.search({
      model: "test-embedding",
      dimensions: 3,
      vector: [1, 0, 0],
      interviewId: "interview-a",
    })).toEqual([]);
    await store.close();
  }, 20_000);
});
