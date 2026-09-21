import { create } from "zustand";
import type {
  QuestionPracticeCompleteReviewRequest,
  QuestionPracticeHistoryItem,
  QuestionPracticeOverview,
  QuestionPracticeSelection,
  QuestionPracticeSelfRating,
  QuestionPracticeSession,
} from "../../shared/contracts/interview-question-practice";
import { questionPracticeGateway } from "../services/question-practice-gateway";

export const QUESTION_PRACTICE_HISTORY_PAGE_SIZE = 30;

export type QuestionPracticeScreen = "library" | "practice" | "summary" | "history";
export type QuestionPracticeDraftStatus = "saved" | "dirty" | "saving" | "error";
export type QuestionPracticeMutation = "start" | "submit" | "review" | "skip" | "abandon" | "leave" | null;

type QuestionPracticeStore = {
  screen: QuestionPracticeScreen;
  overview: QuestionPracticeOverview | null;
  overviewLoading: boolean;
  overviewError: string | null;
  session: QuestionPracticeSession | null;
  sessionLoading: boolean;
  sessionError: string | null;
  draftAnswer: string;
  draftRevision: number;
  draftStatus: QuestionPracticeDraftStatus;
  draftError: string | null;
  mutation: QuestionPracticeMutation;
  operationError: string | null;
  history: QuestionPracticeHistoryItem[];
  historyTotal: number;
  historyHasMore: boolean;
  historyLoading: boolean;
  historyLoadingMore: boolean;
  historyError: string | null;
  initializeOverview: (force?: boolean) => Promise<void>;
  startSession: (selection: QuestionPracticeSelection) => Promise<QuestionPracticeSession | null>;
  resumeSession: (sessionId: string) => Promise<QuestionPracticeSession | null>;
  updateDraft: (answer: string) => void;
  saveDraft: (elapsedSeconds?: number) => Promise<boolean>;
  submitAnswer: (elapsedSeconds?: number) => Promise<boolean>;
  completeReview: (review: Pick<QuestionPracticeCompleteReviewRequest, "selfRating" | "coveredRubricIds" | "note">) => Promise<boolean>;
  skipQuestion: () => Promise<boolean>;
  abandonSession: (elapsedSeconds?: number) => Promise<boolean>;
  returnToLibrary: (elapsedSeconds?: number) => Promise<boolean>;
  openHistory: () => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  closeHistory: () => void;
  clearOperationError: () => void;
};

let overviewSequence = 0;
let sessionSequence = 0;
let historySequence = 0;
let operationCounter = 0;
const draftQueues = new Map<string, Promise<unknown>>();
const retryableOperations = new Map<string, { signature: string; operationId: string }>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function operationId(prefix: string): string {
  operationCounter += 1;
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId ? `${prefix}:${randomId}` : `${prefix}:${Date.now()}:${operationCounter}`;
}

function retryableOperationId(key: string, prefix: string, signature: string): string {
  const current = retryableOperations.get(key);
  if (current?.signature === signature) return current.operationId;
  const next = operationId(prefix);
  retryableOperations.set(key, { signature, operationId: next });
  return next;
}

function completeRetryableOperation(key: string, completedOperationId: string): void {
  if (retryableOperations.get(key)?.operationId === completedOperationId) retryableOperations.delete(key);
}

function draftKey(sessionId: string, itemId: string): string {
  return `${sessionId}:${itemId}`;
}

function enqueueDraft<T>(key: string, mutation: () => Promise<T>): Promise<T> {
  const previous = draftQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(mutation);
  draftQueues.set(key, next);
  const cleanup = (): void => {
    if (draftQueues.get(key) === next) draftQueues.delete(key);
  };
  next.then(cleanup, cleanup);
  return next;
}

function sessionState(session: QuestionPracticeSession): Pick<
  QuestionPracticeStore,
  "session" | "screen" | "draftAnswer" | "draftRevision" | "draftStatus" | "draftError" | "sessionError" | "operationError"
> {
  return {
    session,
    screen: session.status === "active" ? "practice" : "summary",
    draftAnswer: session.currentItem?.draftAnswer ?? "",
    draftRevision: session.currentItem?.draftRevision ?? 0,
    draftStatus: "saved",
    draftError: null,
    sessionError: null,
    operationError: null,
  };
}

function mergeHistory(
  current: QuestionPracticeHistoryItem[],
  incoming: QuestionPracticeHistoryItem[],
): QuestionPracticeHistoryItem[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

export const useQuestionPracticeStore = create<QuestionPracticeStore>((set, get) => ({
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

  initializeOverview: async (force = false) => {
    if (get().overviewLoading || (get().overview && !force)) return;
    const requestSequence = ++overviewSequence;
    set({ overviewLoading: true, overviewError: null });
    try {
      const overview = await questionPracticeGateway.getOverview();
      if (requestSequence !== overviewSequence) return;
      set({ overview, overviewLoading: false, overviewError: null });
    } catch (error) {
      if (requestSequence === overviewSequence) {
        set({ overviewLoading: false, overviewError: errorMessage(error) });
      }
    }
  },

  startSession: async (selection) => {
    if (get().mutation) return null;
    const retryKey = "start";
    const createOperationId = retryableOperationId(retryKey, "start", JSON.stringify(selection));
    set({ mutation: "start", operationError: null, sessionError: null });
    try {
      const session = await questionPracticeGateway.startSession({
        operationId: createOperationId,
        selection,
      });
      completeRetryableOperation(retryKey, createOperationId);
      set({ ...sessionState(session), mutation: null });
      void get().initializeOverview(true);
      return session;
    } catch (error) {
      set({ mutation: null, operationError: errorMessage(error) });
      // A lost IPC response may still mean the main process committed the
      // session. Reconcile the overview so the user can recover it instead of
      // repeatedly attempting to create another active session.
      void get().initializeOverview(true);
      return null;
    }
  },

  resumeSession: async (sessionId) => {
    if (get().mutation) return null;
    const requestSequence = ++sessionSequence;
    set({ sessionLoading: true, sessionError: null, operationError: null });
    try {
      const session = await questionPracticeGateway.getSession(sessionId);
      if (requestSequence !== sessionSequence) return session;
      if (!session) {
        set({ sessionLoading: false, sessionError: "找不到这次练习，它可能已经被删除。" });
        return null;
      }
      set({ ...sessionState(session), sessionLoading: false, mutation: null });
      return session;
    } catch (error) {
      if (requestSequence === sessionSequence) {
        set({ sessionLoading: false, sessionError: errorMessage(error) });
      }
      return null;
    }
  },

  updateDraft: (answer) => {
    const state = get();
    const item = state.session?.currentItem;
    if (state.mutation || !item || state.session?.status !== "active" || item.review || answer === state.draftAnswer) return;
    set({
      draftAnswer: answer,
      draftRevision: state.draftRevision + 1,
      draftStatus: "dirty",
      draftError: null,
      operationError: null,
    });
  },

  saveDraft: async (elapsedSeconds) => {
    const state = get();
    const session = state.session;
    const item = session?.currentItem;
    if (!session || !item || session.status !== "active" || item.review) return true;
    const normalizedElapsed = elapsedSeconds === undefined
      ? undefined
      : Math.max(0, Math.min(604_800, Math.floor(elapsedSeconds)));
    if (state.draftStatus === "saved"
      && (normalizedElapsed === undefined || normalizedElapsed <= (item.elapsedSeconds ?? 0))) return true;
    const answer = state.draftAnswer;
    const draftRevision = state.draftRevision;
    const key = draftKey(session.id, item.id);
    set({ draftStatus: "saving", draftError: null });
    try {
      await enqueueDraft(key, () => questionPracticeGateway.saveDraft({
        sessionId: session.id,
        itemId: item.id,
        draftRevision,
        answer,
        ...(normalizedElapsed === undefined ? {} : { elapsedSeconds: normalizedElapsed }),
      }));
      const current = get();
      if (current.session?.id === session.id && current.session.currentItem?.id === item.id) {
        set({
          draftStatus: current.draftRevision === draftRevision ? "saved" : "dirty",
          ...(current.draftRevision === draftRevision ? { draftError: null } : {}),
        });
      }
      return true;
    } catch (error) {
      const current = get();
      if (current.session?.id === session.id && current.session.currentItem?.id === item.id) {
        set({
          draftStatus: current.draftRevision === draftRevision ? "error" : "dirty",
          draftError: errorMessage(error),
        });
      }
      return false;
    }
  },

  submitAnswer: async (elapsedSeconds) => {
    if (get().mutation) return false;
    if (!get().draftAnswer.trim()) {
      set({ operationError: "请先填写回答，再提交查看参考内容。" });
      return false;
    }
    set({ mutation: "submit", operationError: null });
    if (!(await get().saveDraft(elapsedSeconds))) {
      set({ mutation: null });
      return false;
    }
    const state = get();
    const session = state.session;
    const item = session?.currentItem;
    if (!session || !item || session.status !== "active" || item.review) {
      set({ mutation: null });
      return false;
    }
    const retryKey = `submit:${session.id}:${item.id}`;
    const submitOperationId = retryableOperationId(
      retryKey,
      "submit",
      JSON.stringify([state.draftRevision, state.draftAnswer]),
    );
    try {
      const next = await questionPracticeGateway.submitAnswer({
        sessionId: session.id,
        itemId: item.id,
        operationId: submitOperationId,
        expectedStateVersion: session.stateVersion,
        draftRevision: state.draftRevision,
        answer: state.draftAnswer,
        ...(elapsedSeconds === undefined ? {} : { elapsedSeconds }),
      });
      completeRetryableOperation(retryKey, submitOperationId);
      const current = get();
      if (current.session?.id !== session.id || current.session.currentItem?.id !== item.id) {
        if (current.mutation === "submit") set({ mutation: null });
        return true;
      }
      set({ ...sessionState(next), mutation: null });
      return true;
    } catch (error) {
      const current = get();
      if (current.session?.id === session.id && current.session.currentItem?.id === item.id) {
        set({ mutation: null, operationError: errorMessage(error) });
      } else if (current.mutation === "submit") {
        set({ mutation: null });
      }
      return false;
    }
  },

  completeReview: async (review) => {
    if (get().mutation) return false;
    const session = get().session;
    const item = session?.currentItem;
    if (!session || !item || session.status !== "active" || !item.review) return false;
    const coveredRubricIds = [...review.coveredRubricIds].sort();
    const note = review.note?.trim() ?? "";
    const retryKey = `review:${session.id}:${item.id}`;
    const reviewOperationId = retryableOperationId(
      retryKey,
      "review",
      JSON.stringify([review.selfRating, coveredRubricIds, note]),
    );
    set({ mutation: "review", operationError: null });
    try {
      const next = await questionPracticeGateway.completeReview({
        sessionId: session.id,
        itemId: item.id,
        operationId: reviewOperationId,
        expectedStateVersion: session.stateVersion,
        selfRating: review.selfRating,
        coveredRubricIds,
        ...(note ? { note } : {}),
      });
      completeRetryableOperation(retryKey, reviewOperationId);
      const current = get();
      if (current.session?.id !== session.id || current.session.currentItem?.id !== item.id) {
        if (current.mutation === "review") set({ mutation: null });
        return true;
      }
      set({ ...sessionState(next), mutation: null });
      if (next.status !== "active") {
        void get().initializeOverview(true);
      }
      return true;
    } catch (error) {
      const current = get();
      if (current.session?.id === session.id && current.session.currentItem?.id === item.id) {
        set({ mutation: null, operationError: errorMessage(error) });
      } else if (current.mutation === "review") {
        set({ mutation: null });
      }
      return false;
    }
  },

  skipQuestion: async () => {
    if (get().mutation) return false;
    const session = get().session;
    const item = session?.currentItem;
    if (!session || !item || session.status !== "active" || item.review) return false;
    const retryKey = `skip:${session.id}:${item.id}`;
    const skipOperationId = retryableOperationId(retryKey, "skip", `${session.id}:${item.id}`);
    set({ mutation: "skip", operationError: null });
    try {
      const next = await questionPracticeGateway.skipQuestion({
        sessionId: session.id,
        itemId: item.id,
        operationId: skipOperationId,
        expectedStateVersion: session.stateVersion,
      });
      completeRetryableOperation(retryKey, skipOperationId);
      const current = get();
      if (current.session?.id !== session.id || current.session.currentItem?.id !== item.id) {
        if (current.mutation === "skip") set({ mutation: null });
        return true;
      }
      set({ ...sessionState(next), mutation: null });
      if (next.status !== "active") void get().initializeOverview(true);
      return true;
    } catch (error) {
      const current = get();
      if (current.session?.id === session.id && current.session.currentItem?.id === item.id) {
        set({ mutation: null, operationError: errorMessage(error) });
      } else if (current.mutation === "skip") {
        set({ mutation: null });
      }
      return false;
    }
  },

  abandonSession: async (elapsedSeconds) => {
    if (get().mutation) return false;
    set({ mutation: "abandon", operationError: null });
    const beforeSave = get();
    if (!(await beforeSave.saveDraft(elapsedSeconds))) {
      set({ mutation: null });
      return false;
    }
    const session = get().session;
    if (!session || session.status !== "active") {
      set({ mutation: null });
      return false;
    }
    const retryKey = `abandon:${session.id}`;
    const abandonOperationId = retryableOperationId(retryKey, "abandon", session.id);
    try {
      const next = await questionPracticeGateway.abandonSession({
        sessionId: session.id,
        operationId: abandonOperationId,
        expectedStateVersion: session.stateVersion,
      });
      completeRetryableOperation(retryKey, abandonOperationId);
      if (get().session?.id !== session.id) {
        if (get().mutation === "abandon") set({ mutation: null });
        return true;
      }
      set({ ...sessionState(next), mutation: null });
      void get().initializeOverview(true);
      return true;
    } catch (error) {
      if (get().session?.id === session.id) set({ mutation: null, operationError: errorMessage(error) });
      else if (get().mutation === "abandon") set({ mutation: null });
      return false;
    }
  },

  returnToLibrary: async (elapsedSeconds) => {
    const state = get();
    if (state.mutation) return false;
    set({ mutation: "leave", operationError: null });
    if (!(await state.saveDraft(elapsedSeconds))) {
      if (get().mutation === "leave") set({ mutation: null });
      return false;
    }
    if (get().mutation !== "leave") return false;
    set({ screen: "library", mutation: null, operationError: null, sessionError: null });
    void get().initializeOverview(true);
    return true;
  },

  openHistory: async () => {
    const requestSequence = ++historySequence;
    set({ screen: "history", historyLoading: true, historyLoadingMore: false, historyError: null });
    try {
      const result = await questionPracticeGateway.listHistory({ limit: QUESTION_PRACTICE_HISTORY_PAGE_SIZE, offset: 0 });
      if (requestSequence !== historySequence) return;
      set({
        history: result.items,
        historyTotal: result.total,
        historyHasMore: result.hasMore,
        historyLoading: false,
      });
    } catch (error) {
      if (requestSequence === historySequence) {
        set({ historyLoading: false, historyError: errorMessage(error) });
      }
    }
  },

  loadMoreHistory: async () => {
    const state = get();
    if (state.historyLoading || state.historyLoadingMore || !state.historyHasMore) return;
    const requestSequence = ++historySequence;
    set({ historyLoadingMore: true, historyError: null });
    try {
      const result = await questionPracticeGateway.listHistory({
        limit: QUESTION_PRACTICE_HISTORY_PAGE_SIZE,
        offset: state.history.length,
      });
      if (requestSequence !== historySequence) return;
      set((current) => ({
        history: mergeHistory(current.history, result.items),
        historyTotal: result.total,
        historyHasMore: result.hasMore,
        historyLoadingMore: false,
      }));
    } catch (error) {
      if (requestSequence === historySequence) {
        set({ historyLoadingMore: false, historyError: errorMessage(error) });
      }
    }
  },

  closeHistory: () => set({ screen: "library", historyError: null, sessionError: null }),
  clearOperationError: () => set({ operationError: null, draftError: null }),
}));
