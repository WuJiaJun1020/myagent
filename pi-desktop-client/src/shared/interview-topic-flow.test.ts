import { describe, expect, it } from "vitest";
import type { InterviewTopicFlow } from "./contracts/interview";
import { advanceInterviewTopicFlow, checkInterviewTopicPolicy, closeInterviewTopicFlow,
  formatInterviewTopicControl, type DirectorTopicReport } from "./interview-topic-flow";

function report(overrides: Partial<DirectorTopicReport> = {}): DirectorTopicReport {
  return { answeredTopic: { source: "resume", anchor: "知识助手项目", objective: "厘清个人贡献" },
    answerEvidence: "new", answerCoverage: [], roleGaps: [],
    foundationNeed: "unknown", draft: { move: "continue", source: "resume", anchor: "知识助手项目",
      objective: "追问设计取舍", targetBlockId: "", bridge: "not_needed", switchReason: "none" }, ...overrides };
}

describe("interview topic flow", () => {
  it("separates completed answers from saved analysis and lists coverage without claiming mastery", () => {
    const flow = advanceInterviewTopicFlow(undefined, report({ foundationNeed: "not_needed",
      answerCoverage: [{ kind: "role", label: "权限控制" }, { kind: "role", label: "权限控制" }],
      roleGaps: [{ label: "故障恢复" }] }), 0, false);
    const text = formatInterviewTopicControl(flow, 1, 2);
    expect(text).toContain("历史问答：已完成第 2 轮");
    expect(text).toContain("话题与考察记录：已更新至第 1 轮回答");
    expect(text).toContain("第 2 轮回答已在历史会话中，尚未计入下方记录");
    expect(text).toContain("岗位能力：权限控制\n基础知识：暂无记录");
    expect(text).toContain("基础知识补问：此前判断暂不需要独立补问");
    expect(text).toContain("不代表能力达标");
    expect(text).not.toContain("岗位能力已在回答中考察：是");
    expect(text).not.toContain("优先完成当前话题");
    expect(formatInterviewTopicControl(undefined, 0, 0)).toContain("历史问答：尚无完整问答");
    expect(formatInterviewTopicControl(undefined, 0, 0)).toContain("话题与考察记录：尚未建立");
    expect(formatInterviewTopicControl(undefined, 0, 0)).not.toContain("第 0 轮");
  });

  it("persists one coherent block and the director's coverage labels", () => {
    const next = advanceInterviewTopicFlow(undefined, report({ answerCoverage: [{ kind: "role", label: "检索设计" }] }), 0, false);
    expect(next.blocks).toMatchObject([{ id: "block-1", anchor: "知识助手项目", questionRounds: [1, 2],
      evidenceCount: 1, status: "active" }]);
    expect(next.coverage).toMatchObject([{ kind: "role", label: "检索设计", answerRound: 1 }]);
    expect(formatInterviewTopicControl(next, 1)).toContain("话题：知识助手项目\n段落编号：block-1；来源：简历经历");
    expect(checkInterviewTopicPolicy(next, report(), 1)).toBeNull();
  });

  it("switches at a block boundary and records role assessment after the answer, not from the job text", () => {
    const first = advanceInterviewTopicFlow(undefined, report(), 0, false);
    const switchReport = report({ draft: { move: "switch", source: "role", anchor: "线上可靠性",
      objective: "处理重复工具调用", targetBlockId: "", bridge: "present", switchReason: "sufficient" } });
    expect(checkInterviewTopicPolicy(first, switchReport, 1)).toBeNull();
    const switched = advanceInterviewTopicFlow(first, switchReport, 1, false);
    expect(switched.blocks).toMatchObject([{ status: "completed", questionRounds: [1, 2] },
      { id: "block-2", source: "role", questionRounds: [3], status: "active" }]);
    expect(switched.coverage).toHaveLength(0);
    const roleReport = report({ draft: { move: "continue", source: "role",
      anchor: "线上可靠性", objective: "追问幂等设计", targetBlockId: "", bridge: "not_needed", switchReason: "none" } });
    const afterRole = advanceInterviewTopicFlow(switched, roleReport, 2, false);
    expect(afterRole.coverage).toMatchObject([{ kind: "role", label: "线上可靠性", answerRound: 3 }]);
  });

  it("keeps the existing block identity when a continued topic is reworded, without bypassing repetition checks", () => {
    const first = advanceInterviewTopicFlow(undefined, report(), 0, false);
    const reworded = report({ answeredTopic: { source: "resume", anchor: "项目的新名称", objective: "个人贡献" },
      draft: { ...report().draft, anchor: "同一项目的评测细节", objective: "核实评测结果" } });
    expect(checkInterviewTopicPolicy(first, reworded, 1)).toBeNull();
    const next = advanceInterviewTopicFlow(first, reworded, 1, false);
    expect(next.blocks).toHaveLength(1);
    expect(next.blocks[0]).toMatchObject({ id: "block-1", anchor: "知识助手项目", questionRounds: [1, 2, 3] });
    expect(first.blocks[0].questionRounds).toEqual([1, 2]);
    const stalled = { ...first, blocks: [{ ...first.blocks[0], noNewEvidenceStreak: 1 }] };
    expect(checkInterviewTopicPolicy(stalled, { ...reworded, answerEvidence: "none" }, 1)?.reason)
      .toContain("连续两轮没有获得新证据");
  });

  it("allows a clear switch needing no bridge while retaining the new-evidence requirement for revisits", () => {
    const first = advanceInterviewTopicFlow(undefined, report(), 0, false);
    const next = report({ draft: { move: "switch", source: "resume", anchor: "工单分流项目",
      objective: "了解失败处理", targetBlockId: "", bridge: "not_needed", switchReason: "sufficient" } });
    expect(checkInterviewTopicPolicy(first, next, 1)).toBeNull();
    const switched = advanceInterviewTopicFlow(first, next, 1, false);
    expect(switched.blocks).toMatchObject([{ status: "completed" }, { id: "block-2", anchor: "工单分流项目" }]);
    const revisit = report({ draft: { ...next.draft, move: "revisit", targetBlockId: "block-1", anchor: "知识助手项目" } });
    expect(checkInterviewTopicPolicy(switched, revisit, 2)?.reason).toContain("缺少新的关键事实");
  });

  it("blocks abrupt switches and immediate A-B-A returns without a new contradiction", () => {
    const first = advanceInterviewTopicFlow(undefined, report(), 0, false);
    const abrupt = report({ draft: { move: "switch", source: "foundation", anchor: "数据库事务",
      objective: "核实基础概念", targetBlockId: "", bridge: "missing", switchReason: "coverage_priority" } });
    expect(checkInterviewTopicPolicy(first, abrupt, 1)?.reason).toContain("缺少自然过渡");
    const switched = advanceInterviewTopicFlow(first, report({ draft: { ...abrupt.draft, bridge: "present" } }),
      1, false);
    const back = report({ answeredTopic: { source: "foundation", anchor: "数据库事务", objective: "基础概念" },
      draft: { move: "switch", source: "resume", anchor: "知识助手项目", objective: "继续项目",
        targetBlockId: "", bridge: "present", switchReason: "sufficient" } });
    expect(checkInterviewTopicPolicy(switched, back, 2)?.reason).toContain("伪装成全新话题");
    const revisit = report({ ...back, draft: { ...back.draft, move: "revisit", targetBlockId: "block-1",
      switchReason: "sufficient" } });
    expect(checkInterviewTopicPolicy(switched, revisit, 2)?.reason).toContain("缺少新的关键事实");
    expect(checkInterviewTopicPolicy(switched, { ...revisit, draft: { ...revisit.draft,
      switchReason: "new_contradiction" } }, 2)).toBeNull();
  });

  it("stops low-value repetition but allows related foundation checks inside one block", () => {
    const initial = advanceInterviewTopicFlow(undefined, report({ answerEvidence: "none" }), 0, false);
    const again = report({ answerEvidence: "none", draft: {
      move: "continue", source: "foundation", anchor: "知识助手项目", objective: "核实相关基础概念",
      targetBlockId: "", bridge: "not_needed", switchReason: "none" } });
    expect(checkInterviewTopicPolicy(initial, again, 1)?.reason).toContain("连续两轮没有获得新证据");
    expect(checkInterviewTopicPolicy(initial, { ...again, answerEvidence: "new" }, 1)).toBeNull();
  });

  it("reserves time for untested role abilities without forcing an already covered foundation quiz", () => {
    const current: InterviewTopicFlow = { version: 1, foundationNeed: "satisfied", coverage: [{ kind: "foundation",
      label: "事务隔离", answerRound: 1, evidence: "new" }], blocks: [{ id: "block-1",
      source: "resume", anchor: "知识助手项目", objective: "项目实现", questionRounds: [1, 2, 3],
      evidenceCount: 2, noNewEvidenceStreak: 0, status: "active" }] };
    expect(checkInterviewTopicPolicy(current, report({ foundationNeed: "satisfied" }), 15)?.reason)
      .toContain("岗位能力");
    expect(checkInterviewTopicPolicy(current, report({ foundationNeed: "satisfied", draft: {
      move: "switch", source: "resume", anchor: "另一项目", objective: "追问另一个项目",
      targetBlockId: "", bridge: "present", switchReason: "sufficient" } }), 15)?.reason)
      .toContain("优先考察");
    const roleQuestion = report({ foundationNeed: "satisfied", draft: { move: "continue", source: "role",
      anchor: "知识助手项目", objective: "岗位迁移能力", targetBlockId: "", bridge: "not_needed", switchReason: "none" } });
    expect(checkInterviewTopicPolicy(current, roleQuestion, 15)).toBeNull();
    expect(closeInterviewTopicFlow(current, "手动结束")?.blocks[0]).toMatchObject({ status: "completed",
      exitReason: "手动结束" });
  });

  it("keeps job-derived role gaps pending until the director marks them covered", () => {
    const first = advanceInterviewTopicFlow(undefined, report({ roleGaps: [{ label: "故障恢复" }] }), 0, false);
    expect(first.pendingRoleAbilities).toMatchObject([{ label: "故障恢复" }]);
    expect(formatInterviewTopicControl(first, 1)).toContain("待考察方向（此前记录）：故障恢复");
    const next = advanceInterviewTopicFlow(first, report({
      answerCoverage: [{ kind: "role", label: "故障恢复" }] }), 1, false);
    expect(next.pendingRoleAbilities).toEqual([]);
    expect(next.coverage).toMatchObject([{ kind: "role", label: "故障恢复", answerRound: 2 }]);
  });

  it("counts a related role or foundation question without breaking the current project block", () => {
    const first = advanceInterviewTopicFlow(undefined, report({ draft: { move: "continue", source: "role",
      anchor: "知识助手项目", objective: "故障恢复", targetBlockId: "", bridge: "not_needed",
      switchReason: "none" } }), 0, false);
    expect(first.questionSources).toMatchObject([{ round: 1, source: "resume" },
      { round: 2, source: "role", label: "故障恢复" }]);
    const second = advanceInterviewTopicFlow(first, report(), 1, false);
    expect(second.blocks).toHaveLength(1);
    expect(second.coverage).toMatchObject([{ kind: "role", label: "故障恢复", answerRound: 2 }]);
  });
});
