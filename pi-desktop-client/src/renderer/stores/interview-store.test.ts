import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  InterviewListItem,
  InterviewRecord,
  InterviewSession,
  InterviewStatus,
} from "../../shared/contracts/interview";
import { interviewGateway } from "../services/interview-gateway";
import { DEFAULT_INTERVIEW_CHAT_PROMPTS } from "../../shared/interview-chat-prompt";
import { useInterviewStore } from "./interview-store";

const EMPTY_COUNTS: Record<InterviewStatus, number> = {
  draft: 0,
  preparing: 0,
  ready: 0,
  interviewing: 0,
  generating_report: 0,
  completed: 0,
};

function record(status: InterviewStatus = "draft"): InterviewRecord {
  return {
    id: "interview-1",
    title: "后端工程师 · 张三",
    candidateName: "张三",
    positionTitle: "后端工程师",
    status,
    currentQuestionIndex: 0,
    questionCount: 3,
    competencies: ["技术基础", "项目经验"],
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    documents: [],
  };
}

function session(status: InterviewStatus = "draft"): InterviewSession {
  const interview = record(status);
  return {
    interview,
    plan: status === "ready" ? {
      id: "plan-1",
      version: 1,
      promptVersion: "interview.prepare_questions.v1",
      questionCount: 3,
      competencies: interview.competencies,
      createdAt: "2026-09-20T00:01:00.000Z",
    } : null,
    currentQuestion: null,
    answeredCount: 0,
    preparationError: null,
    turns: [],
  };
}

function listItem(value: InterviewRecord): InterviewListItem {
  return value;
}

describe("interview store session flow", () => {
  beforeEach(() => {
    useInterviewStore.setState({
      interviews: [listItem(record())],
      counts: { ...EMPTY_COUNTS, draft: 1 },
      initialized: true,
      loading: false,
      mutation: false,
      error: null,
      selectedId: null,
      session: null,
      sessionLoading: false,
      chattingInterviewId: null,
      autoStartInterviewId: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens one interview through the session gateway", async () => {
    const draftSession = session();
    const getSession = vi.spyOn(interviewGateway, "getInterviewSession").mockResolvedValue(draftSession);

    await useInterviewStore.getState().openInterview("interview-1");

    expect(getSession).toHaveBeenCalledWith("interview-1");
    expect(useInterviewStore.getState()).toMatchObject({
      selectedId: "interview-1",
      session: draftSession,
      sessionLoading: false,
      error: null,
    });
  });

  it("marks only a newly created interview for automatic opening question", async () => {
    vi.spyOn(interviewGateway, "createInterview").mockResolvedValue(record());
    await useInterviewStore.getState().createInterview({ candidateName: "张三", positionTitle: "后端工程师",
      jobDescription: "", resumeText: "简历", questionCount: 3, competencies: ["项目经验"] });
    expect(useInterviewStore.getState().autoStartInterviewId).toBe("interview-1");
    useInterviewStore.getState().consumeAutoStart("interview-1");
    expect(useInterviewStore.getState().autoStartInterviewId).toBeNull();
  });

  it("reconciles a manually finished interview and keeps its transcript available", async () => {
    const completed = session("completed");
    vi.spyOn(interviewGateway, "finishInterview").mockResolvedValue(completed);
    useInterviewStore.setState({ selectedId: "interview-1", session: session(), autoStartInterviewId: "interview-1" });
    await useInterviewStore.getState().finishInterview("interview-1");
    expect(useInterviewStore.getState()).toMatchObject({ session: completed,
      counts: { draft: 0, completed: 1 }, autoStartInterviewId: null, mutation: false });
  });

  it("removes a deleted interview from history and clears its open session", async () => {
    const remove = vi.spyOn(interviewGateway, "deleteInterview").mockResolvedValue({
      interviews: [], counts: { ...EMPTY_COUNTS },
    });
    useInterviewStore.setState({ selectedId: "interview-1", session: session() });
    await useInterviewStore.getState().deleteInterview("interview-1");
    expect(remove).toHaveBeenCalledWith("interview-1");
    expect(useInterviewStore.getState()).toMatchObject({ interviews: [], selectedId: null,
      session: null, mutation: false, counts: { draft: 0 } });
  });

  it("shows the saved candidate answer before the interviewer call resolves", async () => {
    const opening: InterviewSession = { ...session("interviewing"), turns: [
      { id: "question", ordinal: 0, role: "interviewer", content: "介绍项目。",
        createdAt: "2026-09-20T00:00:00.000Z" },
    ] };
    const candidate: InterviewSession = { ...opening, answeredCount: 1, turns: [
      ...opening.turns,
      { id: "answer", ordinal: 1, role: "candidate", source: "agent", content: "我负责状态管理。",
        createdAt: "2026-09-20T00:00:01.000Z" },
    ] };
    const complete: InterviewSession = { ...candidate, turns: [...candidate.turns,
      { id: "followup", ordinal: 2, role: "interviewer", content: "如何处理失败？",
        createdAt: "2026-09-20T00:00:02.000Z" }] };
    let finish!: (result: { session: InterviewSession; candidateText: string; status: "completed" }) => void;
    vi.spyOn(interviewGateway, "simulateCandidateTurn").mockImplementation((request, onCandidateReady) =>
      new Promise((resolve) => {
        finish = resolve;
        queueMicrotask(() => onCandidateReady?.({ interviewId: request.interviewId,
          operationId: request.operationId, session: candidate }));
      }));
    useInterviewStore.setState({ selectedId: "interview-1", session: opening });

    const task = useInterviewStore.getState().simulateCandidateTurn("interview-1", { reasoning: "medium" },
      "回答问题。", 0, { reasoning: "medium" }, DEFAULT_INTERVIEW_CHAT_PROMPTS);
    await vi.waitFor(() => expect(useInterviewStore.getState().session?.turns).toHaveLength(2));
    expect(useInterviewStore.getState().chattingInterviewId).toBe("interview-1");
    finish({ session: complete, candidateText: "我负责状态管理。", status: "completed" });
    await task;
    expect(useInterviewStore.getState().session?.turns).toHaveLength(3);
    expect(useInterviewStore.getState().chattingInterviewId).toBeNull();
  });
});
