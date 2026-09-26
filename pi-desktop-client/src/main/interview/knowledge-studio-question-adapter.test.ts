import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { KnowledgeInterviewImportPayload } from "../../shared/contracts/knowledge-studio";
import { InterviewDatabase } from "./interview-database";
import { knowledgeStudioQuestionPackage } from "./knowledge-studio-question-adapter";

const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

function payload(answer = "先解释共享状态的合并规则，再说明节点写入的边界。合理的设计要避免无意覆盖，并让后续节点能读到一致状态。"):
KnowledgeInterviewImportPayload {
  return {
    batchId: "batch-a", title: "Agent 面试题包", targetRole: "Agent 工程师",
    sources: [{ id: "source-a", title: "LangGraph 手册", kind: "file", format: "markdown", contentHash: "a".repeat(64) }],
    questions: [{
      id: "candidate-a", ordinal: 0, kind: "system-design", difficulty: "basic", competency: "状态设计",
      question: "LangGraph 中多个节点更新共享状态时，如何设计字段合并规则，避免后写入的值意外覆盖前面的结果？",
      answer, rubric: [{ title: "合并策略", description: "说清楚何时覆盖及何时合并", weight: 100 }],
      pitfalls: ["依赖默认覆盖"], followUps: ["如何测试并发更新？"],
      evidence: [{ sourceId: "source-a", sourceTitle: "LangGraph 手册", segmentId: "source-a:segment:0", quote: "共享状态需要显式合并规则" }],
    }],
  };
}

describe("Knowledge Studio → interview question bank adapter", () => {
  it("preserves answer, rubric, evidence and original kind without changing the old bank schema", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-knowledge-interview-import-"));
    cleanup.push(directory);
    const database = new InterviewDatabase(join(directory, "interview.db"));
    try {
      const pack = knowledgeStudioQuestionPackage(payload());
      expect(pack.questions[0]).toMatchObject({
        stableKey: "knowledge-studio:batch-a:0", status: "published", kind: "scenario", difficulty: "introductory",
        metadata: { originalKind: "system-design", referenceAnswer: payload().questions[0]!.answer },
      });
      expect(database.importQuestionPackage(pack)).toMatchObject({ inserted: 1, updated: 0, alreadyImported: false });
      const detail = database.getQuestionBankItem("knowledge-studio:batch-a:0");
      expect(detail).toMatchObject({
        prompt: payload().questions[0]!.question, subtype: "system-design",
        referenceAnswer: payload().questions[0]!.answer,
        rubric: [{ label: "合并策略", weight: 100 }],
        evidence: [{ segmentId: "source-a:segment:0", quote: "共享状态需要显式合并规则" }],
        source: { title: "LangGraph 手册", parserId: "knowledge-studio" },
      });
      expect(database.listQuestionBank().total).toBe(1);
      expect(database.importQuestionPackage(pack).alreadyImported).toBe(true);
      expect(database.listQuestionBank().total).toBe(1);

      const revised = knowledgeStudioQuestionPackage(payload("修改后的口语化参考答案。"));
      expect(revised.packageVersion).not.toBe(pack.packageVersion);
      expect(database.importQuestionPackage(revised)).toMatchObject({ inserted: 0, updated: 1 });
      expect(database.getQuestionBankItem("knowledge-studio:batch-a:0")).toMatchObject({
        version: 2, referenceAnswer: "修改后的口语化参考答案。",
      });
      expect(database.listQuestionBank().total).toBe(1);
    } finally {
      database.close();
    }
  });
});
