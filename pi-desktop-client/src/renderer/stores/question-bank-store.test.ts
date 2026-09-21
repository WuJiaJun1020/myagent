import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  QuestionBankListResult,
  QuestionBankQuestionDetail,
  QuestionBankQuestionSummary,
  QuestionBankSnapshot,
} from "../../shared/contracts/interview-question-bank";
import { questionBankGateway } from "../services/question-bank-gateway";
import { useQuestionBankStore } from "./question-bank-store";

const SNAPSHOT: QuestionBankSnapshot = {
  total: 2,
  published: 2,
  favorites: 0,
  byKind: { technical: 2, project: 0, behavioral: 0, scenario: 0 },
  byDifficulty: { introductory: 1, intermediate: 1, advanced: 0 },
  roles: [{ value: "backend", label: "后端开发", count: 2 }],
  skills: [{ value: "python", label: "Python", count: 2 }],
};

function summary(id: string, favorite = false): QuestionBankQuestionSummary {
  return {
    id,
    stableKey: `builtin.${id}`,
    version: 1,
    status: "published",
    title: `题目 ${id}`,
    prompt: `请回答 ${id}`,
    kind: "technical",
    subtype: "concept",
    difficulty: "intermediate",
    roles: ["backend"],
    seniority: ["junior"],
    competencies: ["技术基础"],
    skills: ["python"],
    estimatedSeconds: 120,
    favorite,
    sourceLabel: "内置题库",
    updatedAt: "2026-09-21T00:00:00.000Z",
  };
}

function detail(id: string, favorite = false): QuestionBankQuestionDetail {
  return {
    ...summary(id, favorite),
    intent: "考察基础知识",
    answerOutline: ["回答要点"],
    rubric: [{ id: "r1", label: "准确", description: "回答准确", weight: 1, critical: true }],
    commonMistakes: ["混淆概念"],
    followUps: [{ prompt: "为什么？", trigger: "候选人回答后" }],
    source: {
      id: "source-1",
      type: "builtin",
      title: "内置题库",
      contentHash: "sha256:test",
    },
  };
}

function page(items: QuestionBankQuestionSummary[], total = items.length, hasMore = false): QuestionBankListResult {
  return { items, total, offset: 0, limit: 30, hasMore };
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

describe("question bank store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useQuestionBankStore.setState({
      snapshot: null,
      items: [],
      total: 0,
      hasMore: false,
      initialized: false,
      snapshotError: null,
      loading: false,
      loadingMore: false,
      error: null,
      filters: { search: "", favoritesOnly: false },
      selectedId: null,
      detail: null,
      detailLoading: false,
      detailError: null,
      favoritePendingIds: new Set(),
      favoriteError: null,
    });
  });

  it("loads summaries first and requests detail only for the selected question", async () => {
    const first = summary("q1");
    vi.spyOn(questionBankGateway, "getSnapshot").mockResolvedValue(SNAPSHOT);
    vi.spyOn(questionBankGateway, "listQuestions").mockResolvedValue(page([first]));
    const getQuestion = vi.spyOn(questionBankGateway, "getQuestion").mockResolvedValue(detail("q1"));

    await useQuestionBankStore.getState().initialize();

    expect(getQuestion).toHaveBeenCalledTimes(1);
    expect(getQuestion).toHaveBeenCalledWith("q1");
    expect(useQuestionBankStore.getState()).toMatchObject({
      initialized: true,
      selectedId: "q1",
      detail: { id: "q1" },
    });
  });

  it("ignores a stale filtered list response", async () => {
    const slow = deferred<QuestionBankListResult>();
    const fast = deferred<QuestionBankListResult>();
    vi.spyOn(questionBankGateway, "listQuestions").mockImplementation((query) => (
      query.search === "slow" ? slow.promise : fast.promise
    ));
    vi.spyOn(questionBankGateway, "getQuestion").mockImplementation(async (id) => detail(id));

    const firstLoad = useQuestionBankStore.getState().setFilters({ search: "slow" });
    const secondLoad = useQuestionBankStore.getState().setFilters({ search: "fast" });
    fast.resolve(page([summary("fast")]));
    await secondLoad;
    slow.resolve(page([summary("slow")]));
    await firstLoad;

    expect(useQuestionBankStore.getState()).toMatchObject({
      filters: { search: "fast" },
      items: [{ id: "fast" }],
      selectedId: "fast",
    });
  });

  it("keeps the unfiltered snapshot when the first list request becomes stale", async () => {
    const snapshotLoad = deferred<QuestionBankSnapshot>();
    const initialList = deferred<QuestionBankListResult>();
    vi.spyOn(questionBankGateway, "getSnapshot").mockReturnValue(snapshotLoad.promise);
    vi.spyOn(questionBankGateway, "listQuestions").mockImplementation(async (query) => (
      query.search === "fast" ? page([summary("fast")]) : initialList.promise
    ));
    vi.spyOn(questionBankGateway, "getQuestion").mockImplementation(async (id) => detail(id));

    const initialization = useQuestionBankStore.getState().initialize();
    await useQuestionBankStore.getState().setFilters({ search: "fast" });
    snapshotLoad.resolve(SNAPSHOT);
    initialList.resolve(page([summary("stale")]));
    await initialization;

    expect(useQuestionBankStore.getState()).toMatchObject({
      snapshot: SNAPSHOT,
      filters: { search: "fast" },
      items: [{ id: "fast" }],
    });
  });

  it("keeps the optimistic favorite count when an older snapshot completes", async () => {
    const snapshotLoad = deferred<QuestionBankSnapshot>();
    useQuestionBankStore.setState({
      snapshot: SNAPSHOT,
      initialized: true,
      items: [summary("q1")],
      selectedId: "q1",
      detail: detail("q1"),
    });
    vi.spyOn(questionBankGateway, "getSnapshot").mockReturnValue(snapshotLoad.promise);
    vi.spyOn(questionBankGateway, "listQuestions").mockResolvedValue(page([summary("q1")]));
    vi.spyOn(questionBankGateway, "setFavorite").mockResolvedValue({
      questionId: "q1",
      favorite: true,
      favorites: 1,
    });

    const refresh = useQuestionBankStore.getState().initialize(true);
    await useQuestionBankStore.getState().toggleFavorite("q1");
    snapshotLoad.resolve(SNAPSHOT);
    await refresh;

    expect(useQuestionBankStore.getState().snapshot?.favorites).toBe(1);
    expect(useQuestionBankStore.getState().items[0]?.favorite).toBe(true);
  });

  it("does not double-restore the favorite count when an older snapshot and persistence failure cross", async () => {
    const snapshotLoad = deferred<QuestionBankSnapshot>();
    const favoritePersistence = deferred<{ questionId: string; favorite: boolean; favorites: number }>();
    const favoriteSnapshot = { ...SNAPSHOT, favorites: 1 };
    useQuestionBankStore.setState({
      snapshot: favoriteSnapshot,
      initialized: true,
      items: [summary("q1", true)],
      selectedId: "q1",
      detail: detail("q1", true),
    });
    vi.spyOn(questionBankGateway, "getSnapshot").mockReturnValue(snapshotLoad.promise);
    vi.spyOn(questionBankGateway, "listQuestions").mockResolvedValue(page([summary("q1", true)]));
    vi.spyOn(questionBankGateway, "setFavorite").mockReturnValue(favoritePersistence.promise);

    const refresh = useQuestionBankStore.getState().initialize(true);
    const mutation = useQuestionBankStore.getState().toggleFavorite("q1");
    snapshotLoad.resolve(favoriteSnapshot);
    await refresh;
    favoritePersistence.reject(new Error("database busy"));
    await mutation;

    expect(useQuestionBankStore.getState().snapshot?.favorites).toBe(1);
    expect(useQuestionBankStore.getState().items[0]?.favorite).toBe(true);
  });

  it("surfaces and can retry a snapshot failure even when a newer filtered list succeeds", async () => {
    const snapshotLoad = deferred<QuestionBankSnapshot>();
    const initialList = deferred<QuestionBankListResult>();
    const snapshot = vi.spyOn(questionBankGateway, "getSnapshot").mockReturnValueOnce(snapshotLoad.promise);
    vi.spyOn(questionBankGateway, "listQuestions").mockImplementation(async (query) => (
      query.search === "fast" ? page([summary("fast")]) : initialList.promise
    ));
    vi.spyOn(questionBankGateway, "getQuestion").mockImplementation(async (id) => detail(id));

    const initialization = useQuestionBankStore.getState().initialize();
    await useQuestionBankStore.getState().setFilters({ search: "fast" });
    snapshotLoad.reject(new Error("snapshot unavailable"));
    initialList.resolve(page([summary("stale")]));
    await initialization;
    expect(useQuestionBankStore.getState()).toMatchObject({
      initialized: true,
      snapshot: null,
      snapshotError: "snapshot unavailable",
      items: [{ id: "fast" }],
    });

    snapshot.mockResolvedValueOnce(SNAPSHOT);
    await useQuestionBankStore.getState().initialize(true);
    expect(useQuestionBankStore.getState()).toMatchObject({ snapshot: SNAPSHOT, snapshotError: null });
  });

  it("ignores an older snapshot failure after a favorite-triggered refresh succeeds", async () => {
    const oldSnapshot = deferred<QuestionBankSnapshot>();
    const freshSnapshot = deferred<QuestionBankSnapshot>();
    useQuestionBankStore.setState({
      snapshot: null,
      snapshotError: "previous failure",
      initialized: true,
      items: [summary("q1")],
      selectedId: "q1",
      detail: detail("q1"),
    });
    vi.spyOn(questionBankGateway, "getSnapshot")
      .mockReturnValueOnce(oldSnapshot.promise)
      .mockReturnValueOnce(freshSnapshot.promise);
    vi.spyOn(questionBankGateway, "listQuestions").mockResolvedValue(page([summary("q1")]));
    vi.spyOn(questionBankGateway, "setFavorite").mockResolvedValue({
      questionId: "q1",
      favorite: true,
      favorites: 1,
    });

    const initialization = useQuestionBankStore.getState().initialize(true);
    const mutation = useQuestionBankStore.getState().toggleFavorite("q1");
    freshSnapshot.resolve({ ...SNAPSHOT, favorites: 1 });
    await mutation;
    oldSnapshot.reject(new Error("stale snapshot failure"));
    await initialization;

    expect(useQuestionBankStore.getState()).toMatchObject({
      snapshot: { favorites: 1 },
      snapshotError: null,
      items: [{ id: "q1", favorite: true }],
    });
  });

  it("appends another page without duplicating an existing question", async () => {
    useQuestionBankStore.setState({
      initialized: true,
      items: [summary("q1")],
      total: 3,
      hasMore: true,
    });
    const list = vi.spyOn(questionBankGateway, "listQuestions").mockResolvedValue({
      items: [summary("q1"), summary("q2")],
      total: 2,
      offset: 1,
      limit: 30,
      hasMore: false,
    });

    await useQuestionBankStore.getState().loadMore();

    expect(list).toHaveBeenCalledWith(expect.objectContaining({ offset: 1, limit: 30 }));
    expect(useQuestionBankStore.getState().items.map((item) => item.id)).toEqual(["q1", "q2"]);
  });

  it("rolls an optimistic favorite change back when persistence fails", async () => {
    useQuestionBankStore.setState({
      snapshot: SNAPSHOT,
      initialized: true,
      items: [summary("q1")],
      selectedId: "q1",
      detail: detail("q1"),
    });
    vi.spyOn(questionBankGateway, "setFavorite").mockRejectedValue(new Error("database busy"));

    await useQuestionBankStore.getState().toggleFavorite("q1");

    expect(useQuestionBankStore.getState().items[0]?.favorite).toBe(false);
    expect(useQuestionBankStore.getState().detail?.favorite).toBe(false);
    expect(useQuestionBankStore.getState().snapshot?.favorites).toBe(0);
    expect(useQuestionBankStore.getState().favoriteError).toBe("database busy");
  });

  it("removes a successfully unfavorited row even when refreshing the favorites filter fails", async () => {
    useQuestionBankStore.setState({
      snapshot: { ...SNAPSHOT, favorites: 1 },
      initialized: true,
      filters: { search: "", favoritesOnly: true },
      items: [summary("q1", true)],
      total: 1,
      selectedId: "q1",
      detail: detail("q1", true),
    });
    vi.spyOn(questionBankGateway, "setFavorite").mockResolvedValue({
      questionId: "q1",
      favorite: false,
      favorites: 0,
    });
    vi.spyOn(questionBankGateway, "listQuestions").mockRejectedValue(new Error("refresh failed"));

    await useQuestionBankStore.getState().toggleFavorite("q1");

    expect(useQuestionBankStore.getState()).toMatchObject({
      items: [],
      total: 0,
      selectedId: null,
      detail: null,
      snapshot: { favorites: 0 },
      error: "refresh failed",
    });
  });

  it("does not let an older detail response overwrite a completed favorite mutation", async () => {
    const detailLoad = deferred<QuestionBankQuestionDetail | null>();
    useQuestionBankStore.setState({
      snapshot: SNAPSHOT,
      initialized: true,
      items: [summary("q1")],
      selectedId: "q1",
      detail: null,
    });
    vi.spyOn(questionBankGateway, "getQuestion").mockReturnValue(detailLoad.promise);
    vi.spyOn(questionBankGateway, "setFavorite").mockResolvedValue({
      questionId: "q1",
      favorite: true,
      favorites: 1,
    });

    const selection = useQuestionBankStore.getState().selectQuestion("q1", true);
    await useQuestionBankStore.getState().toggleFavorite("q1");
    detailLoad.resolve(detail("q1", false));
    await selection;

    expect(useQuestionBankStore.getState().items[0]?.favorite).toBe(true);
    expect(useQuestionBankStore.getState().detail?.favorite).toBe(true);
  });

  it("does not let an older list response overwrite a completed favorite mutation", async () => {
    const listLoad = deferred<QuestionBankListResult>();
    useQuestionBankStore.setState({
      snapshot: SNAPSHOT,
      initialized: true,
      items: [summary("q1")],
      selectedId: "q1",
      detail: detail("q1"),
    });
    vi.spyOn(questionBankGateway, "listQuestions").mockReturnValue(listLoad.promise);
    vi.spyOn(questionBankGateway, "setFavorite").mockResolvedValue({
      questionId: "q1",
      favorite: true,
      favorites: 1,
    });

    const filtering = useQuestionBankStore.getState().setFilters({ search: "Python" });
    await useQuestionBankStore.getState().toggleFavorite("q1");
    listLoad.resolve(page([summary("q1", false)]));
    await filtering;

    expect(useQuestionBankStore.getState().items[0]?.favorite).toBe(true);
    expect(useQuestionBankStore.getState().detail?.favorite).toBe(true);
  });
});
