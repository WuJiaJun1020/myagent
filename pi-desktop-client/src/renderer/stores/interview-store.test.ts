import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  InterviewListItem,
  InterviewRecord,
  InterviewSession,
  InterviewStatus,
} from "../../shared/contracts/interview";
import { interviewGateway } from "../services/interview-gateway";
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
      preparingInterviewId: null,
      preparationProgress: null,
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

  it("never sends interview material before explicit privacy confirmation", async () => {
    const prepare = vi.spyOn(interviewGateway, "prepareInterview");

    await expect(useInterviewStore.getState().prepareInterview("interview-1", false))
      .rejects.toThrow("请先确认");

    expect(prepare).not.toHaveBeenCalled();
  });

  it("reconciles the persisted ready session and status counts after preparation", async () => {
    const readySession = session("ready");
    vi.spyOn(interviewGateway, "prepareInterview").mockResolvedValue(readySession);
    useInterviewStore.setState({ selectedId: "interview-1", session: session() });

    await useInterviewStore.getState().prepareInterview("interview-1", true);

    const state = useInterviewStore.getState();
    expect(state.session).toEqual(readySession);
    expect(state.interviews[0]?.status).toBe("ready");
    expect(state.counts).toMatchObject({ draft: 0, ready: 1 });
    expect(state.preparingInterviewId).toBeNull();
    expect(state.preparationProgress?.phase).toBe("completed");
  });

  it("only presents preparation progress for the open interview", () => {
    useInterviewStore.setState({ selectedId: "interview-1" });
    const setProgress = useInterviewStore.getState().setPreparationProgress;
    setProgress({ interviewId: "other", operationId: "op-other", phase: "calling_model", message: "other" });
    expect(useInterviewStore.getState().preparationProgress).toBeNull();

    setProgress({ interviewId: "interview-1", operationId: "op-1", phase: "saving", message: "正在保存" });
    expect(useInterviewStore.getState().preparationProgress).toMatchObject({
      interviewId: "interview-1",
      phase: "saving",
      message: "正在保存",
    });
  });

  it("reloads persisted terminal state after the renderer was refreshed mid-preparation", async () => {
    const readySession = session("ready");
    const getSession = vi.spyOn(interviewGateway, "getInterviewSession").mockResolvedValue(readySession);
    useInterviewStore.setState({
      selectedId: "interview-1",
      session: session("preparing"),
      preparingInterviewId: null,
    });

    useInterviewStore.getState().setPreparationProgress({
      interviewId: "interview-1",
      operationId: "op-after-reload",
      phase: "completed",
      message: "面试计划已准备完成。",
    });
    await vi.waitFor(() => expect(useInterviewStore.getState().session?.interview.status).toBe("ready"));

    expect(getSession).toHaveBeenCalledWith("interview-1");
    expect(useInterviewStore.getState().sessionLoading).toBe(false);
  });

  it("reloads the persisted failure state so retry survives navigation", async () => {
    const failedSession = { ...session(), preparationError: { code: "provider_error", message: "模型暂时不可用" } };
    vi.spyOn(interviewGateway, "prepareInterview").mockRejectedValue(new Error("模型暂时不可用"));
    vi.spyOn(interviewGateway, "getInterviewSession").mockResolvedValue(failedSession);
    useInterviewStore.setState({ selectedId: "interview-1", session: session() });

    await expect(useInterviewStore.getState().prepareInterview("interview-1", true))
      .rejects.toThrow("模型暂时不可用");

    expect(useInterviewStore.getState()).toMatchObject({
      session: failedSession,
      preparingInterviewId: null,
      error: "模型暂时不可用",
      preparationProgress: { phase: "failed" },
    });
  });
});
