import { createHash } from "node:crypto";
import type { KnowledgeInterviewImportPayload } from "../../shared/contracts/knowledge-studio";
import type { InterviewQuestionKind } from "../../shared/contracts/interview";
import type { QuestionBankPackageInput, QuestionBankQuestionInput, QuestionBankSourceInput } from "./interview-database";

function interviewKind(kind: KnowledgeInterviewImportPayload["questions"][number]["kind"]): InterviewQuestionKind {
  // The interview bank has no dedicated system-design category yet. Keep the
  // original kind in metadata/subtype so the import remains lossless.
  return kind === "system-design" ? "scenario" : kind;
}

function sourceKind(kind: KnowledgeInterviewImportPayload["sources"][number]["kind"]): QuestionBankSourceInput["kind"] {
  return kind === "url" ? "web" : kind === "file" ? "file" : "manual";
}

function mimeType(format: KnowledgeInterviewImportPayload["sources"][number]["format"]): string {
  switch (format) {
    case "markdown": return "text/markdown";
    case "html": return "text/html";
    case "pdf": return "application/pdf";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default: return "text/plain";
  }
}

/** Maps a reviewed Knowledge Studio batch to the existing versioned question-bank import. */
export function knowledgeStudioQuestionPackage(payload: KnowledgeInterviewImportPayload): QuestionBankPackageInput {
  const usedSourceIds = new Set(payload.questions.flatMap((question) => question.evidence.map((item) => item.sourceId)));
  const sources: QuestionBankSourceInput[] = payload.sources.filter((source) => usedSourceIds.has(source.id)).map((source) => ({
    key: source.id,
    kind: sourceKind(source.kind),
    title: source.title,
    ...(source.sourceUrl ? { uri: source.sourceUrl } : {}),
    mimeType: mimeType(source.format),
    parserId: "knowledge-studio",
    parserVersion: "1",
    contentHash: source.contentHash,
    metadata: { knowledgeSourceId: source.id, format: source.format },
  }));
  if (sources.length === 0) throw new Error("没有可导入的原文来源");
  const availableSources = new Set(sources.map((source) => source.key));
  const questions: QuestionBankQuestionInput[] = payload.questions.map((question) => {
    const sourceIds = [...new Set(question.evidence.map((item) => item.sourceId))];
    if (!sourceIds.length || sourceIds.some((id) => !availableSources.has(id))) {
      throw new Error(`第 ${question.ordinal + 1} 题的原文证据来源不可用`);
    }
    return {
      stableKey: `knowledge-studio:${payload.batchId}:${question.ordinal}`,
      status: "published", // Test integration: visible in the existing bank and practice flow.
      title: question.question.length > 72 ? `${question.question.slice(0, 71)}…` : question.question,
      prompt: question.question,
      kind: interviewKind(question.kind),
      difficulty: question.difficulty === "basic" ? "introductory" : question.difficulty,
      answerOutline: [question.answer],
      commonMistakes: question.pitfalls,
      metadata: {
        origin: "knowledge-studio",
        batchId: payload.batchId,
        candidateId: question.id,
        ordinal: question.ordinal,
        originalKind: question.kind,
        subtype: question.kind,
        intent: question.competency,
        referenceAnswer: question.answer,
        evidence: question.evidence,
      },
      tags: [
        { axis: "role", key: payload.targetRole, label: payload.targetRole },
        { axis: "competency", key: question.competency, label: question.competency },
        { axis: "subtype", key: question.kind, label: question.kind },
      ],
      rubric: question.rubric.map((item, index) => ({
        id: `rubric-${index + 1}`,
        criterion: item.title,
        description: item.description,
        weight: item.weight,
      })),
      followups: question.followUps.map((prompt) => ({ prompt })),
      sources: sourceIds.map((sourceId) => ({
        sourceKey: sourceId,
        locator: { segmentIds: [...new Set(question.evidence.filter((item) => item.sourceId === sourceId).map((item) => item.segmentId))] },
      })),
    };
  });
  const contentHash = createHash("sha256").update(JSON.stringify({ sources, questions }), "utf8").digest("hex");
  return {
    packageId: `knowledge-studio:${payload.batchId}`,
    packageVersion: contentHash,
    contentHash,
    sources,
    questions,
  };
}
