import { create } from "zustand";
import type {
  AlgorithmMode,
  AlgorithmModeProgress,
  AlgorithmPracticeSnapshot,
  AlgorithmProblemDetail,
  AlgorithmResetDraftRequest,
  AlgorithmRunRequest,
  AlgorithmRunResult,
  AlgorithmSaveDraftRequest,
} from "../../shared/contracts/algorithm-practice";
import { algorithmPracticeGateway } from "../services/algorithm-practice-gateway";

export type AlgorithmWorkbenchView = AlgorithmMode | "answers";
export type AlgorithmDraftStatus = "saved" | "dirty" | "saving" | "error";
export type AlgorithmRunSource = "draft" | "answer";

export type AlgorithmRunContext = {
  slug: string;
  mode: AlgorithmMode;
  source: AlgorithmRunSource;
  answerFile?: string;
};

type DraftStatusMap = Record<AlgorithmMode, AlgorithmDraftStatus>;

type AlgorithmPracticeStore = {
  snapshot: AlgorithmPracticeSnapshot | null;
  initialized: boolean;
  loading: boolean;
  error: string | null;
  selectedSlug: string | null;
  problem: AlgorithmProblemDetail | null;
  problemLoading: boolean;
  problemError: string | null;
  view: AlgorithmWorkbenchView;
  activeMode: AlgorithmMode;
  draftStatus: DraftStatusMap;
  saveError: string | null;
  running: boolean;
  runningContext: AlgorithmRunContext | null;
  runResult: AlgorithmRunResult | null;
  runResultContext: AlgorithmRunContext | null;
  runError: string | null;
  initialize: (force?: boolean) => Promise<void>;
  selectProblem: (slug: string, force?: boolean) => Promise<AlgorithmProblemDetail | null>;
  setView: (view: AlgorithmWorkbenchView) => void;
  updateDraft: (mode: AlgorithmMode, code: string) => void;
  saveDraft: (request: AlgorithmSaveDraftRequest) => Promise<void>;
  resetDraft: (request: AlgorithmResetDraftRequest) => Promise<void>;
  run: (request: AlgorithmRunRequest, source?: AlgorithmRunSource) => Promise<AlgorithmRunResult | null>;
  clearRunResult: () => void;
  clearError: () => void;
};

const INITIAL_DRAFT_STATUS: DraftStatusMap = { leetcode: "saved", acm: "saved" };

let snapshotLoadSequence = 0;
let problemLoadSequence = 0;
let runSequence = 0;
const draftQueues = new Map<string, Promise<void>>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function draftKey(slug: string, mode: AlgorithmMode): string {
  return `${slug}:${mode}`;
}

function enqueueDraftMutation(key: string, mutation: () => Promise<void>): Promise<void> {
  const previous = draftQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(mutation);
  draftQueues.set(key, next);
  const cleanup = () => {
    if (draftQueues.get(key) === next) draftQueues.delete(key);
  };
  next.then(cleanup, cleanup);
  return next;
}

function replaceSummaryProgress(
  snapshot: AlgorithmPracticeSnapshot | null,
  slug: string,
  mode: AlgorithmMode,
  progress: AlgorithmModeProgress,
): AlgorithmPracticeSnapshot | null {
  if (!snapshot) return snapshot;
  const previous = snapshot.problems.find((item) => item.slug === slug)?.progress[mode];
  const solvedDelta = previous?.solved === progress.solved ? 0 : progress.solved ? 1 : -1;
  return {
    ...snapshot,
    solved: {
      ...snapshot.solved,
      [mode]: Math.max(0, snapshot.solved[mode] + solvedDelta),
    },
    problems: snapshot.problems.map((item) => item.slug === slug ? {
      ...item,
      progress: { ...item.progress, [mode]: progress },
    } : item),
  };
}

function reconcileDetailProgress(
  snapshot: AlgorithmPracticeSnapshot | null,
  detail: AlgorithmProblemDetail,
): AlgorithmPracticeSnapshot | null {
  let next = snapshot;
  next = replaceSummaryProgress(next, detail.slug, "leetcode", detail.progress.leetcode);
  next = replaceSummaryProgress(next, detail.slug, "acm", detail.progress.acm);
  return next;
}

function contextIsCurrent(
  state: Pick<AlgorithmPracticeStore, "selectedSlug" | "view">,
  context: AlgorithmRunContext,
): boolean {
  if (state.selectedSlug !== context.slug) return false;
  return context.source === "answer" ? state.view === "answers" : state.view === context.mode;
}

export const useAlgorithmPracticeStore = create<AlgorithmPracticeStore>((set, get) => ({
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
  draftStatus: { ...INITIAL_DRAFT_STATUS },
  saveError: null,
  running: false,
  runningContext: null,
  runResult: null,
  runResultContext: null,
  runError: null,

  initialize: async (force = false) => {
    if (get().loading || (get().initialized && !force)) return;
    const requestSequence = ++snapshotLoadSequence;
    set({ loading: true, error: null });
    try {
      const snapshot = await algorithmPracticeGateway.getSnapshot();
      if (requestSequence !== snapshotLoadSequence) return;
      const previousSlug = get().selectedSlug;
      const selectedSlug = previousSlug && snapshot.problems.some((item) => item.slug === previousSlug)
        ? previousSlug
        : snapshot.problems[0]?.slug ?? null;
      set({ snapshot, selectedSlug, initialized: true, loading: false, error: null });
      if (selectedSlug) await get().selectProblem(selectedSlug, true);
    } catch (error) {
      if (requestSequence === snapshotLoadSequence) {
        set({ loading: false, error: errorMessage(error) });
      }
    }
  },

  selectProblem: async (slug, force = false) => {
    const state = get();
    if (!force && state.selectedSlug === slug && state.problem?.slug === slug) return state.problem;
    const requestSequence = ++problemLoadSequence;
    runSequence += 1;
    set({
      selectedSlug: slug,
      problem: null,
      problemLoading: true,
      problemError: null,
      saveError: null,
      running: false,
      runningContext: null,
      runResult: null,
      runResultContext: null,
      runError: null,
      draftStatus: { ...INITIAL_DRAFT_STATUS },
    });
    try {
      const problem = await algorithmPracticeGateway.getProblem(slug);
      if (requestSequence !== problemLoadSequence || get().selectedSlug !== slug) return problem;
      set((current) => ({
        problem,
        problemLoading: false,
        problemError: null,
        snapshot: reconcileDetailProgress(current.snapshot, problem),
        draftStatus: { ...INITIAL_DRAFT_STATUS },
      }));
      return problem;
    } catch (error) {
      if (requestSequence === problemLoadSequence && get().selectedSlug === slug) {
        set({ problemLoading: false, problemError: errorMessage(error) });
      }
      return null;
    }
  },

  setView: (view) => {
    if (get().view === view) return;
    runSequence += 1;
    set({
      view,
      ...(view === "answers" ? {} : { activeMode: view }),
      running: false,
      runningContext: null,
      runResult: null,
      runResultContext: null,
      runError: null,
    });
  },

  updateDraft: (mode, code) => {
    const problem = get().problem;
    if (!problem || problem.drafts[mode] === code) return;
    runSequence += 1;
    set((state) => ({
      problem: state.problem ? {
        ...state.problem,
        drafts: { ...state.problem.drafts, [mode]: code },
      } : null,
      draftStatus: { ...state.draftStatus, [mode]: "dirty" },
      saveError: null,
      running: false,
      runningContext: null,
      runResult: null,
      runResultContext: null,
      runError: null,
    }));
  },

  saveDraft: async (request) => {
    const isCurrent = () => {
      const state = get();
      return state.problem?.slug === request.slug && state.problem.drafts[request.mode] === request.code;
    };
    if (isCurrent()) {
      set((state) => ({
        draftStatus: { ...state.draftStatus, [request.mode]: "saving" },
        saveError: null,
      }));
    }
    try {
      await enqueueDraftMutation(draftKey(request.slug, request.mode), () => algorithmPracticeGateway.saveDraft(request));
      set((state) => {
        if (state.problem?.slug !== request.slug) return {};
        const unchanged = state.problem.drafts[request.mode] === request.code;
        return {
          draftStatus: { ...state.draftStatus, [request.mode]: unchanged ? "saved" : "dirty" },
          ...(unchanged ? { saveError: null } : {}),
        };
      });
    } catch (error) {
      const message = errorMessage(error);
      set((state) => {
        if (state.problem?.slug !== request.slug) return {};
        const unchanged = state.problem.drafts[request.mode] === request.code;
        return {
          draftStatus: { ...state.draftStatus, [request.mode]: unchanged ? "error" : "dirty" },
          saveError: message,
        };
      });
      throw error;
    }
  },

  resetDraft: async (request) => {
    const state = get();
    if (!state.problem || state.problem.slug !== request.slug) return;
    const previousProblem = state.problem;
    const template = previousProblem.templates[request.mode];
    runSequence += 1;
    set((current) => ({
      problem: current.problem?.slug === request.slug ? {
        ...current.problem,
        drafts: { ...current.problem.drafts, [request.mode]: template },
      } : current.problem,
      draftStatus: { ...current.draftStatus, [request.mode]: "saving" },
      saveError: null,
      running: false,
      runningContext: null,
      runResult: null,
      runResultContext: null,
      runError: null,
    }));
    try {
      await enqueueDraftMutation(draftKey(request.slug, request.mode), () => algorithmPracticeGateway.resetDraft(request));
      set((current) => {
        if (current.problem?.slug !== request.slug) return {};
        const unchanged = current.problem.drafts[request.mode] === template;
        return {
          draftStatus: { ...current.draftStatus, [request.mode]: unchanged ? "saved" : "dirty" },
        };
      });
    } catch (error) {
      const message = errorMessage(error);
      set((current) => {
        if (current.problem?.slug !== request.slug) return {};
        const unchanged = current.problem.drafts[request.mode] === template;
        return {
          problem: unchanged ? {
            ...current.problem,
            drafts: { ...current.problem.drafts, [request.mode]: previousProblem.drafts[request.mode] },
          } : current.problem,
          draftStatus: { ...current.draftStatus, [request.mode]: unchanged ? "error" : "dirty" },
          saveError: message,
        };
      });
      throw error;
    }
  },

  run: async (request, source = "draft") => {
    const context: AlgorithmRunContext = {
      slug: request.slug,
      mode: request.mode,
      source,
      ...(request.answerFile ? { answerFile: request.answerFile } : {}),
    };
    const requestSequence = ++runSequence;
    set({
      running: true,
      runningContext: context,
      runResult: null,
      runResultContext: null,
      runError: null,
    });
    try {
      if (source === "draft") {
        await get().saveDraft({ slug: request.slug, mode: request.mode, code: request.code });
        if (requestSequence !== runSequence) return null;
      }
      const result = await algorithmPracticeGateway.run(request);
      set((state) => {
        if (requestSequence !== runSequence) return {};
        const snapshot = replaceSummaryProgress(state.snapshot, result.slug, result.mode, result.progress);
        const problem = state.problem?.slug === result.slug ? {
          ...state.problem,
          progress: { ...state.problem.progress, [result.mode]: result.progress },
        } : state.problem;
        if (!contextIsCurrent(state, context)) return { snapshot, problem };
        return {
          snapshot,
          problem,
          running: false,
          runningContext: null,
          runResult: result,
          runResultContext: context,
          runError: null,
        };
      });
      return result;
    } catch (error) {
      if (requestSequence === runSequence && contextIsCurrent(get(), context)) {
        set({ running: false, runningContext: null, runError: errorMessage(error) });
      }
      return null;
    }
  },

  clearRunResult: () => {
    runSequence += 1;
    set({ running: false, runningContext: null, runResult: null, runResultContext: null, runError: null });
  },

  clearError: () => set({ error: null, problemError: null, saveError: null, runError: null }),
}));
