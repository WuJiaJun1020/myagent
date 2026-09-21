import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  QuestionPracticeCurrentItem,
  QuestionPracticeReviewMaterial,
  QuestionPracticeSession,
} from "../../shared/contracts/interview-question-practice";
import { questionPracticeGateway } from "../services/question-practice-gateway";
import { useQuestionPracticeStore } from "./question-practice-store";

const SUMMARY = {
  answered: 0,
  reviewed: 0,
  skipped: 0,
  totalElapsedSeconds: 0,
  ratingCounts: { needs_review: 0, developing: 0, mastered: 0 },
  weakSkills: [],
  weakCompetencies: [],
};

const REVIEW: QuestionPracticeReviewMaterial = {
  intent: "考察基础知识",
  answerOutline: ["先说明定义", "再解释取舍"],
  rubric: [{ id: "rubric-1", label: "定义准确", description: "覆盖核心概念", weight: 1, critical: true }],
  commonMistakes: ["只给结论"],
  followUps: [],
  source: { id: "source-1", type: "builtin", title: "内置题库", contentHash: "sha256:test" },
};

function currentItem(id = "item-1", ordinal = 0): QuestionPracticeCurrentItem {
  return {
    id,
    ordinal,
    stableKey: `builtin.${id}`,
    version: 1,
    title: `题目 ${ordinal + 1}`,
    difficulty: "intermediate",
    status: "answering",
    questionId: `question-${ordinal + 1}`,
    prompt: "请解释这个概念。",
    kind: "technical",
    roles: ["backend"],
    seniority: ["junior"],
    competencies: ["technical-foundation"],
    skills: ["python"],
    estimatedSeconds: 180,
    draftAnswer: "",
    draftRevision: 0,
    coveredRubricIds: [],
    startedAt: "2026-09-21T00:00:00.000Z",
  };
}

function session(overrides: Partial<QuestionPracticeSession> = {}): QuestionPracticeSession {
  const item = currentItem();
  return {
    id: "session-1",
    status: "active",
    selectionKind: "filtered",
    questionCount: 2,
    currentOrdinal: 0,
    stateVersion: 1,
    queue: [
      { id: item.id, ordinal: 0, stableKey: item.stableKey, version: 1, title: item.title, difficulty: item.difficulty, status: item.status },
      { id: "item-2", ordinal: 1, stableKey: "builtin.item-2", version: 1, title: "题目 2", difficulty: "introductory", status: "pending" },
    ],
    currentItem: item,
    summary: { ...SUMMARY, ratingCounts: { ...SUMMARY.ratingCounts } },
    startedAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("question practice store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useQuestionPracticeStore.setState({
      screen: "library",
      overview: null,
      overviewLoading: false,
      overviewError: null,
      session: null,
      sessionLoading: false,
      sessionError: null,
      draftAnswer: "",
      draftRevision: 0,
      draftStatus: "saved",
      draftError: null,
      mutation: null,
      operationError: null,
      history: [],
      historyTotal: 0,
      historyHasMore: false,
      historyLoading: false,
      historyLoadingMore: false,
      historyError: null,
    });
  });

  it("creates a filtered practice session and opens the workbench", async () => {
    const started = session();
    const start = vi.spyOn(questionPracticeGateway, "startSession").mockResolvedValue(started);
    vi.spyOn(questionPracticeGateway, "getOverview").mockResolvedValue({ completedSessions: 0, practicedQuestions: 0, dueReview: 0 });

    await useQuestionPracticeStore.getState().startSession({
      kind: "filtered",
      query: { difficulty: "intermediate", skill: "python" },
      count: 5,
      order: "random",
    });

    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      operationId: expect.stringMatching(/^start:/),
      selection: expect.objectContaining({ kind: "filtered", count: 5 }),
    }));
    expect(useQuestionPracticeStore.getState()).toMatchObject({
      screen: "practice",
      session: { id: "session-1" },
      draftStatus: "saved",
    });
  });

  it("keeps a newer edit dirty when an older draft save finishes", async () => {
    const pending = deferred<{ sessionId: string; itemId: string; draftRevision: number; savedAt: string }>();
    useQuestionPracticeStore.setState({ ...useQuestionPracticeStore.getState(), ...{
      screen: "practice",
      session: session(),
      draftAnswer: "第一版",
      draftRevision: 1,
      draftStatus: "dirty" as const,
    } });
    vi.spyOn(questionPracticeGateway, "saveDraft").mockReturnValue(pending.promise);

    const saving = useQuestionPracticeStore.getState().saveDraft();
    useQuestionPracticeStore.getState().updateDraft("第二版");
    pending.resolve({ sessionId: "session-1", itemId: "item-1", draftRevision: 1, savedAt: "2026-09-21T00:00:01.000Z" });
    await saving;

    expect(useQuestionPracticeStore.getState()).toMatchObject({
      draftAnswer: "第二版",
      draftRevision: 2,
      draftStatus: "dirty",
    });
  });

  it("locks the draft while an answer operation owns the session", () => {
    useQuestionPracticeStore.setState({
      screen: "practice",
      session: session(),
      draftAnswer: "提交时的回答",
      draftRevision: 1,
      draftStatus: "saved",
      mutation: "submit",
    });

    useQuestionPracticeStore.getState().updateDraft("请求途中继续输入");

    expect(useQuestionPracticeStore.getState()).toMatchObject({
      draftAnswer: "提交时的回答",
      draftRevision: 1,
      draftStatus: "saved",
    });
  });

  it("reveals review material only after answer submission succeeds", async () => {
    const submitted = deferred<QuestionPracticeSession>();
    const active = session();
    useQuestionPracticeStore.setState({
      screen: "practice",
      session: active,
      draftAnswer: "我的回答",
      draftRevision: 1,
      draftStatus: "dirty",
    });
    vi.spyOn(questionPracticeGateway, "saveDraft").mockResolvedValue({ sessionId: active.id, itemId: "item-1", draftRevision: 1, savedAt: "2026-09-21T00:00:01.000Z" });
    const submit = vi.spyOn(questionPracticeGateway, "submitAnswer").mockReturnValue(submitted.promise);

    const submission = useQuestionPracticeStore.getState().submitAnswer(42);
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(useQuestionPracticeStore.getState().session?.currentItem?.review).toBeUndefined();

    submitted.resolve(session({
      stateVersion: 2,
      currentItem: { ...currentItem(), status: "reviewing", draftAnswer: "我的回答", draftRevision: 1, answerText: "我的回答", review: REVIEW },
    }));
    await submission;

    expect(useQuestionPracticeStore.getState().session?.currentItem).toMatchObject({
      status: "reviewing",
      answerText: "我的回答",
      review: { intent: "考察基础知识" },
    });
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ answer: "我的回答", elapsedSeconds: 42 }));
  });

  it("advances to the next question after saving self review", async () => {
    const reviewing = session({
      stateVersion: 2,
      currentItem: { ...currentItem(), status: "reviewing", answerText: "回答", review: REVIEW },
    });
    const nextItem = currentItem("item-2", 1);
    useQuestionPracticeStore.setState({ screen: "practice", session: reviewing, draftAnswer: "回答", draftStatus: "saved" });
    const complete = vi.spyOn(questionPracticeGateway, "completeReview").mockResolvedValue(session({
      stateVersion: 3,
      currentOrdinal: 1,
      currentItem: nextItem,
      queue: reviewing.queue.map((item) => item.ordinal === 1 ? { ...item, status: "completed" } : { ...item, status: "answering" }),
    }));

    await useQuestionPracticeStore.getState().completeReview({
      selfRating: "developing",
      coveredRubricIds: ["rubric-1"],
      note: "需要补充细节",
    });

    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      expectedStateVersion: 2,
      selfRating: "developing",
      coveredRubricIds: ["rubric-1"],
    }));
    expect(useQuestionPracticeStore.getState()).toMatchObject({
      screen: "practice",
      session: { currentOrdinal: 1, currentItem: { id: "item-2" } },
      draftAnswer: "",
      draftRevision: 0,
    });
  });

  it("reuses the submit operation id after an uncertain IPC failure", async () => {
    const active = session();
    const reviewing = session({
      stateVersion: 2,
      currentItem: { ...currentItem(), status: "reviewing", draftAnswer: "同一回答", draftRevision: 1, answerText: "同一回答", review: REVIEW },
    });
    useQuestionPracticeStore.setState({
      screen: "practice",
      session: active,
      draftAnswer: "同一回答",
      draftRevision: 1,
      draftStatus: "saved",
    });
    vi.spyOn(questionPracticeGateway, "saveDraft").mockResolvedValue({
      sessionId: active.id,
      itemId: "item-1",
      draftRevision: 1,
      savedAt: "2026-09-21T00:00:20.000Z",
    });
    const submit = vi.spyOn(questionPracticeGateway, "submitAnswer")
      .mockRejectedValueOnce(new Error("IPC connection closed"))
      .mockResolvedValueOnce(reviewing);

    expect(await useQuestionPracticeStore.getState().submitAnswer(20)).toBe(false);
    expect(await useQuestionPracticeStore.getState().submitAnswer(24)).toBe(true);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[0]![0].operationId).toBe(submit.mock.calls[1]![0].operationId);
  });

  it("opens the summary when a completed session is restored", async () => {
    vi.spyOn(questionPracticeGateway, "getSession").mockResolvedValue(session({
      status: "completed",
      currentItem: null,
      completedAt: "2026-09-21T00:10:00.000Z",
      summary: { ...SUMMARY, answered: 2, reviewed: 2, ratingCounts: { needs_review: 0, developing: 1, mastered: 1 } },
    }));

    await useQuestionPracticeStore.getState().resumeSession("session-1");

    expect(useQuestionPracticeStore.getState()).toMatchObject({ screen: "summary", session: { status: "completed" } });
  });

  it("does not leave the workbench when a dirty draft cannot be saved", async () => {
    useQuestionPracticeStore.setState({
      screen: "practice",
      session: session(),
      draftAnswer: "尚未保存",
      draftRevision: 1,
      draftStatus: "dirty",
    });
    vi.spyOn(questionPracticeGateway, "saveDraft").mockRejectedValue(new Error("database busy"));

    const returned = await useQuestionPracticeStore.getState().returnToLibrary();

    expect(returned).toBe(false);
    expect(useQuestionPracticeStore.getState()).toMatchObject({
      screen: "practice",
      mutation: null,
      draftStatus: "error",
      draftError: "database busy",
    });
  });

  it("locks editing until a dirty draft is saved before returning", async () => {
    const pending = deferred<{ sessionId: string; itemId: string; draftRevision: number; savedAt: string }>();
    useQuestionPracticeStore.setState({
      screen: "practice",
      session: session(),
      draftAnswer: "离开前保存",
      draftRevision: 1,
      draftStatus: "dirty",
    });
    vi.spyOn(questionPracticeGateway, "saveDraft").mockReturnValue(pending.promise);
    vi.spyOn(questionPracticeGateway, "getOverview").mockResolvedValue({ completedSessions: 0, practicedQuestions: 0, dueReview: 0 });

    const returning = useQuestionPracticeStore.getState().returnToLibrary();
    await vi.waitFor(() => expect(useQuestionPracticeStore.getState().mutation).toBe("leave"));
    useQuestionPracticeStore.getState().updateDraft("不应覆盖");
    expect(useQuestionPracticeStore.getState().draftAnswer).toBe("离开前保存");

    pending.resolve({ sessionId: "session-1", itemId: "item-1", draftRevision: 1, savedAt: "2026-09-21T00:00:02.000Z" });
    expect(await returning).toBe(true);
    expect(useQuestionPracticeStore.getState()).toMatchObject({ screen: "library", mutation: null, draftStatus: "saved" });
  });

  it("persists accumulated answer time when leaving with an otherwise clean draft", async () => {
    const active = session({
      currentItem: { ...currentItem(), elapsedSeconds: 12 },
    });
    useQuestionPracticeStore.setState({
      screen: "practice",
      session: active,
      draftAnswer: "",
      draftRevision: 0,
      draftStatus: "saved",
    });
    const save = vi.spyOn(questionPracticeGateway, "saveDraft").mockResolvedValue({
      sessionId: active.id,
      itemId: "item-1",
      draftRevision: 0,
      savedAt: "2026-09-21T00:00:35.000Z",
    });
    vi.spyOn(questionPracticeGateway, "getOverview").mockResolvedValue({
      completedSessions: 0,
      practicedQuestions: 0,
      dueReview: 0,
    });

    expect(await useQuestionPracticeStore.getState().returnToLibrary(35)).toBe(true);

    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      draftRevision: 0,
      elapsedSeconds: 35,
    }));
    expect(useQuestionPracticeStore.getState()).toMatchObject({ screen: "library", draftStatus: "saved" });
  });

  it("waits for the current draft before abandoning a session", async () => {
    const pending = deferred<{ sessionId: string; itemId: string; draftRevision: number; savedAt: string }>();
    const active = session();
    const abandoned = session({ status: "abandoned", currentItem: null, abandonedAt: "2026-09-21T00:00:03.000Z" });
    useQuestionPracticeStore.setState({
      screen: "practice",
      session: active,
      draftAnswer: "最后一版草稿",
      draftRevision: 1,
      draftStatus: "dirty",
    });
    vi.spyOn(questionPracticeGateway, "saveDraft").mockReturnValue(pending.promise);
    const abandon = vi.spyOn(questionPracticeGateway, "abandonSession").mockResolvedValue(abandoned);
    vi.spyOn(questionPracticeGateway, "getOverview").mockResolvedValue({ completedSessions: 0, practicedQuestions: 0, dueReview: 0 });

    const abandoning = useQuestionPracticeStore.getState().abandonSession();
    await vi.waitFor(() => expect(useQuestionPracticeStore.getState().draftStatus).toBe("saving"));
    expect(abandon).not.toHaveBeenCalled();

    pending.resolve({ sessionId: active.id, itemId: "item-1", draftRevision: 1, savedAt: "2026-09-21T00:00:02.000Z" });
    expect(await abandoning).toBe(true);
    expect(abandon).toHaveBeenCalledTimes(1);
    expect(useQuestionPracticeStore.getState()).toMatchObject({ screen: "summary", mutation: null, session: { status: "abandoned" } });
  });

  it("loads and appends practice history without duplicate sessions", async () => {
    const first = { id: "s1", status: "completed" as const, selectionKind: "single" as const, questionCount: 1, currentOrdinal: 1, answered: 1, reviewed: 1, skipped: 0, startedAt: "2026-09-20", updatedAt: "2026-09-20", completedAt: "2026-09-20" };
    const second = { ...first, id: "s2" };
    vi.spyOn(questionPracticeGateway, "listHistory")
      .mockResolvedValueOnce({ items: [first], total: 2, offset: 0, limit: 30, hasMore: true })
      .mockResolvedValueOnce({ items: [first, second], total: 2, offset: 1, limit: 30, hasMore: false });

    await useQuestionPracticeStore.getState().openHistory();
    await useQuestionPracticeStore.getState().loadMoreHistory();

    expect(useQuestionPracticeStore.getState().history.map((item) => item.id)).toEqual(["s1", "s2"]);
    expect(useQuestionPracticeStore.getState().historyHasMore).toBe(false);
  });
});
