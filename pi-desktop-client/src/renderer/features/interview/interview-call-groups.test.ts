import { describe, expect, it } from "vitest";
import type { InterviewCallTrace, InterviewSession, InterviewTurn } from "../../../shared/contracts/interview";
import { buildInterviewCallGroups } from "./interview-call-groups";

const now = "2026-09-25T00:00:00.000Z";
const at = (second: number) => `2026-09-25T00:00:${String(second).padStart(2, "0")}.000Z`;
function trace(operationId: string, actor: InterviewCallTrace["actor"], status: InterviewCallTrace["status"] = "succeeded",
  outputText?: string, startedAt = now): InterviewCallTrace {
  return { operationId, actor, status, startedAt, finishedAt: startedAt,
    requestedModel: { providerId: "openai-codex", modelId: "gpt-6-luna" }, reasoning: "medium", timeoutMs: 180_000,
    messages: [], attempts: actor === "candidate_gate" ? [] : [{ providerId: "openai-codex", modelId: "gpt-6-luna",
      startedAt, finishedAt: startedAt }], ...(outputText ? { outputText } : {}) };
}

describe("interview call groups", () => {
  it("groups each question with its candidate answer and the calls that produced them", () => {
    const turns: InterviewTurn[] = [
      { id: "q1", ordinal: 0, role: "interviewer", content: "第一问", createdAt: now,
        trace: trace("opening", "interviewer") },
      { id: "a1", ordinal: 3, role: "candidate", content: "回答", createdAt: now },
      { id: "q2", ordinal: 7, role: "interviewer", content: "第二问", createdAt: now,
        trace: trace("reply:revision", "interviewer", "succeeded", undefined, at(30)) },
    ];
    const session = { turns, debugEvents: [
      { id: "gate", ordinal: 1, createdAt: now, trace: trace("gate", "candidate_gate") },
      { id: "candidate", ordinal: 2, createdAt: now, trace: trace("candidate", "candidate") },
      { id: "draft", ordinal: 4, createdAt: now,
        trace: trace("reply:draft", "interviewer", "succeeded", undefined, at(10)) },
      { id: "director", ordinal: 5, createdAt: now,
        trace: trace("reply:director", "director", "succeeded", '{"action":"redirect"}', at(20)) },
      { id: "verify", ordinal: 6, createdAt: now,
        trace: trace("reply:director-verify-1", "director", "succeeded", '{"action":"pass"}', at(40)) },
      { id: "score", ordinal: 8, createdAt: now, trace: trace("score", "score") },
    ] } as InterviewSession;
    const groups = buildInterviewCallGroups(session);
    expect(groups.map((item) => [item.label, item.entries.length])).toEqual([
      ["第 1 轮", 3], ["第 2 轮（待回答）", 4], ["会后调用", 1],
    ]);
    expect(groups[0].entries.map((entry) => entry.trace.actor)).toEqual(["interviewer", "candidate_gate", "candidate"]);
    expect(groups[1]).toMatchObject({ directorAction: "redirect", modelCalls: 4 });
    expect(groups[1].entries.map((entry) => entry.trace.actor)).toEqual(["interviewer", "director", "interviewer", "director"]);
    expect(groups[1].entries.map((entry) => entry.trace.operationId)).toEqual([
      "reply:draft", "reply:director", "reply:revision", "reply:director-verify-1",
    ]);
    expect(groups[2].entries[0].trace.actor).toBe("score");
  });

  it("shows an accepted interviewer draft before its director review even when saved on the later turn", () => {
    const session = { interview: { status: "interviewing" }, turns: [
      { id: "q1", ordinal: 0, role: "interviewer", content: "第一问", createdAt: now,
        trace: trace("opening", "interviewer") },
      { id: "a1", ordinal: 2, role: "candidate", content: "回答", createdAt: now },
      { id: "q2", ordinal: 4, role: "interviewer", content: "第二问", createdAt: now,
        trace: trace("reply", "interviewer", "succeeded", undefined, at(10)) },
    ], debugEvents: [
      { id: "candidate", ordinal: 1, createdAt: now, trace: trace("candidate", "candidate") },
      { id: "director", ordinal: 3, createdAt: now,
        trace: trace("reply:director", "director", "succeeded", '{"action":"pass"}', at(20)) },
    ] } as InterviewSession;
    const groups = buildInterviewCallGroups(session);
    expect(groups[1].label).toBe("第 2 轮（待回答）");
    expect(groups[1].entries.map((entry) => entry.trace.operationId)).toEqual(["reply", "reply:director"]);
    expect(groups[1].modelCalls).toBe(2);
  });

  it("keeps failed next-question calls outside the answered round", () => {
    const session = { interview: { status: "interviewing" }, turns: [
      { id: "q1", ordinal: 0, role: "interviewer", content: "第一问", createdAt: now,
        trace: trace("opening", "interviewer") },
      { id: "a1", ordinal: 2, role: "candidate", content: "回答", createdAt: now },
    ], debugEvents: [
      { id: "candidate", ordinal: 1, createdAt: now, trace: trace("candidate", "candidate") },
      { id: "failed-next", ordinal: 3, createdAt: now, trace: trace("next", "interviewer", "failed") },
    ] } as InterviewSession;
    const groups = buildInterviewCallGroups(session);
    expect(groups.map((item) => [item.label, item.entries.length])).toEqual([
      ["第 1 轮", 2], ["未发送草稿与会后调用", 1],
    ]);
    expect(groups[0].hasFailure).toBe(false);
    expect(groups[1].hasFailure).toBe(true);
  });

  it("does not count a closing message as another question-answer round", () => {
    const session = { interview: { status: "completed" }, turns: [
      { id: "q1", ordinal: 0, role: "interviewer", content: "第一问", createdAt: now,
        trace: trace("opening", "interviewer") },
      { id: "a1", ordinal: 1, role: "candidate", content: "回答", createdAt: now },
      { id: "closing", ordinal: 2, role: "interviewer", questionType: "other", content: "谢谢，再见。",
        createdAt: now, trace: trace("closing", "interviewer") },
    ], debugEvents: [
      { id: "score", ordinal: 3, createdAt: now, trace: trace("score", "score") },
    ] } as InterviewSession;
    expect(buildInterviewCallGroups(session).map((item) => item.label)).toEqual([
      "第 1 轮", "面试收尾", "会后调用",
    ]);
  });

  it("keeps failed opening calls accessible without a published question", () => {
    const session = { turns: [], debugEvents: [{ id: "failed", ordinal: 0, createdAt: now,
      trace: trace("opening", "interviewer", "failed") }] } as unknown as InterviewSession;
    expect(buildInterviewCallGroups(session)).toMatchObject([
      { id: "other", label: "开场调用", hasFailure: true },
    ]);
  });
});
