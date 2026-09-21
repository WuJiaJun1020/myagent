import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AlgorithmPracticeSnapshot,
  AlgorithmProblemDetail,
  AlgorithmProblemSummary,
  AlgorithmRunResult,
} from "../../shared/contracts/algorithm-practice";
import { algorithmPracticeGateway } from "../services/algorithm-practice-gateway";
import { useAlgorithmPracticeStore } from "./algorithm-practice-store";

const unsolved = { solved: false, attempts: 0 } as const;

function summary(slug: string, id: number, solved = false): AlgorithmProblemSummary {
  return {
    id,
    slug,
    title: slug,
    difficulty: "easy",
    category: "哈希",
    tags: ["数组"],
    progress: {
      leetcode: solved ? { solved: true, attempts: 2, bestTimeMs: 8, solvedAt: "2026-09-20" } : { ...unsolved },
      acm: { ...unsolved },
    },
  };
}

function detail(slug: string, id: number, solved = false): AlgorithmProblemDetail {
  return {
    ...summary(slug, id, solved),
    description: "题目描述",
    constraints: [],
    followUp: "",
    leetcode: { className: "Solution", methodName: "solve", parameters: [] },
    acm: { inputFields: [], outputType: "int", description: "" },
    examples: [],
    templates: { leetcode: "class Solution:\n    pass", acm: "print(0)" },
    drafts: { leetcode: "custom", acm: "print(0)" },
    answers: [],
  };
}

function snapshot(problems: AlgorithmProblemSummary[]): AlgorithmPracticeSnapshot {
  return {
    collection: { id: "hot-100", title: "Hot 100", description: "" },
    categories: [{ name: "哈希", count: problems.length }],
    problems,
    runtime: { available: true, source: "embedded", displayName: "内置 Python", version: "3.12.10" },
    solved: {
      leetcode: problems.filter((problem) => problem.progress.leetcode.solved).length,
      acm: 0,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

describe("algorithm practice store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAlgorithmPracticeStore.setState({
      snapshot: null,
      initialized: false,
      loading: false,
      error: null,
      selectedSlug: null,
      problem: null,
      problemLoading: false,
      problemError: null,
      view: "leetcode",
      activeMode: "leetcode",
      draftStatus: { leetcode: "saved", acm: "saved" },
      saveError: null,
      running: false,
      runningContext: null,
      runResult: null,
      runResultContext: null,
      runError: null,
    });
  });

  it("keeps solved history when restoring the starter template", async () => {
    const problem = detail("two_sum", 1, true);
    useAlgorithmPracticeStore.setState({
      snapshot: snapshot([summary("two_sum", 1, true)]),
      selectedSlug: problem.slug,
      problem,
      initialized: true,
    });
    vi.spyOn(algorithmPracticeGateway, "resetDraft").mockResolvedValue();

    await useAlgorithmPracticeStore.getState().resetDraft({ slug: problem.slug, mode: "leetcode" });

    const state = useAlgorithmPracticeStore.getState();
    expect(state.problem?.drafts.leetcode).toBe(problem.templates.leetcode);
    expect(state.problem?.progress.leetcode).toEqual(problem.progress.leetcode);
    expect(state.snapshot?.solved.leetcode).toBe(1);
  });

  it("ignores a slow problem response after the user selected another problem", async () => {
    const first = deferred<AlgorithmProblemDetail>();
    const second = deferred<AlgorithmProblemDetail>();
    vi.spyOn(algorithmPracticeGateway, "getProblem").mockImplementation((slug) => (
      slug === "first" ? first.promise : second.promise
    ));
    const loadFirst = useAlgorithmPracticeStore.getState().selectProblem("first");
    const loadSecond = useAlgorithmPracticeStore.getState().selectProblem("second");

    second.resolve(detail("second", 2));
    await loadSecond;
    first.resolve(detail("first", 1));
    await loadFirst;

    expect(useAlgorithmPracticeStore.getState()).toMatchObject({
      selectedSlug: "second",
      problem: { slug: "second" },
      problemLoading: false,
    });
  });

  it("runs a reference answer without autosaving it as the user draft", async () => {
    const problem = detail("two_sum", 1);
    problem.answers = [{ mode: "leetcode", name: "哈希", file: "leetcode_hash.py", code: "trusted" }];
    useAlgorithmPracticeStore.setState({ selectedSlug: problem.slug, problem, view: "answers" });
    const save = vi.spyOn(algorithmPracticeGateway, "saveDraft").mockResolvedValue();
    const result: AlgorithmRunResult = {
      submissionId: "reference:1",
      slug: problem.slug,
      mode: "leetcode",
      verdict: "accepted",
      passed: 1,
      total: 1,
      durationMs: 1,
      cases: [],
      progress: { ...unsolved },
    };
    vi.spyOn(algorithmPracticeGateway, "run").mockResolvedValue(result);

    await useAlgorithmPracticeStore.getState().run({
      slug: problem.slug,
      mode: "leetcode",
      code: "trusted",
      answerFile: "leetcode_hash.py",
    }, "answer");

    expect(save).not.toHaveBeenCalled();
    expect(useAlgorithmPracticeStore.getState().problem?.drafts.leetcode).toBe("custom");
    expect(useAlgorithmPracticeStore.getState().runResult).toEqual(result);
  });
});
