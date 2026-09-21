import { create } from "zustand";
import type {
  InterviewCreateRequest,
  InterviewListItem,
  InterviewPreparationProgress,
  InterviewRecord,
  InterviewSession,
  InterviewSnapshot,
  InterviewStatus,
} from "../../shared/contracts/interview";
import { interviewGateway } from "../services/interview-gateway";

const EMPTY_COUNTS: Record<InterviewStatus, number> = {
  draft: 0,
  preparing: 0,
  ready: 0,
  interviewing: 0,
  generating_report: 0,
  completed: 0,
};

type InterviewStore = InterviewSnapshot & {
  initialized: boolean;
  loading: boolean;
  mutation: boolean;
  error: string | null;
  selectedId: string | null;
  session: InterviewSession | null;
  sessionLoading: boolean;
  preparingInterviewId: string | null;
  preparationProgress: InterviewPreparationProgress | null;
  initialize: (force?: boolean) => Promise<void>;
  createInterview: (request: InterviewCreateRequest) => Promise<InterviewRecord>;
  selectInterview: (id: string | null) => void;
  openInterview: (id: string) => Promise<InterviewSession | null>;
  prepareInterview: (id: string, privacyConfirmed: boolean) => Promise<InterviewSession>;
  setPreparationProgress: (progress: InterviewPreparationProgress) => void;
};

function replaceOrInsert(interviews: InterviewListItem[], interview: InterviewListItem): InterviewListItem[] {
  return [interview, ...interviews.filter((item) => item.id !== interview.id)];
}

function reconcileInterview(
  interviews: InterviewListItem[],
  counts: Record<InterviewStatus, number>,
  interview: InterviewListItem,
): Pick<InterviewSnapshot, "interviews" | "counts"> {
  const previous = interviews.find((item) => item.id === interview.id);
  const nextCounts = { ...counts };
  if (!previous) nextCounts[interview.status] += 1;
  else if (previous.status !== interview.status) {
    nextCounts[previous.status] = Math.max(0, nextCounts[previous.status] - 1);
    nextCounts[interview.status] += 1;
  }
  return { interviews: replaceOrInsert(interviews, interview), counts: nextCounts };
}

function createOperationId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `interview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let sessionLoadSequence = 0;

export const useInterviewStore = create<InterviewStore>((set, get) => ({
  interviews: [],
  counts: { ...EMPTY_COUNTS },
  initialized: false,
  loading: false,
  mutation: false,
  error: null,
  selectedId: null,
  session: null,
  sessionLoading: false,
  preparingInterviewId: null,
  preparationProgress: null,
  initialize: async (force = false) => {
    if (get().loading || (get().initialized && !force)) return;
    set({ loading: true, error: null });
    try {
      const snapshot = await interviewGateway.getSnapshot();
      set((state) => ({
        ...snapshot,
        initialized: true,
        loading: false,
        selectedId: state.selectedId && snapshot.interviews.some((item) => item.id === state.selectedId)
          ? state.selectedId
          : snapshot.interviews[0]?.id ?? null,
      }));
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },
  createInterview: async (request) => {
    if (get().mutation) throw new Error("正在保存面试草稿");
    set({ mutation: true, error: null });
    try {
      const interview = await interviewGateway.createInterview(request);
      set((state) => ({
        ...reconcileInterview(state.interviews, state.counts, interview),
        selectedId: interview.id,
        session: null,
        preparationProgress: null,
        mutation: false,
      }));
      return interview;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ mutation: false, error: message });
      throw error;
    }
  },
  selectInterview: (selectedId) => {
    if (get().selectedId === selectedId) return;
    sessionLoadSequence += 1;
    set({ selectedId, session: null, sessionLoading: false, preparationProgress: null, error: null });
  },
  openInterview: async (id) => {
    const requestSequence = ++sessionLoadSequence;
    set({ selectedId: id, session: null, sessionLoading: true, preparationProgress: null, error: null });
    try {
      const session = await interviewGateway.getInterviewSession(id);
      if (requestSequence !== sessionLoadSequence || get().selectedId !== id) return session;
      if (!session) {
        set({ sessionLoading: false, error: "找不到这场面试，它可能已被删除。" });
        return null;
      }
      set((state) => ({
        ...reconcileInterview(state.interviews, state.counts, session.interview),
        session,
        sessionLoading: false,
      }));
      return session;
    } catch (error) {
      if (requestSequence === sessionLoadSequence && get().selectedId === id) {
        set({ sessionLoading: false, error: error instanceof Error ? error.message : String(error) });
      }
      return null;
    }
  },
  prepareInterview: async (id, privacyConfirmed) => {
    if (!privacyConfirmed) {
      const error = new Error("请先确认将岗位描述和简历发送给当前模型 Provider。");
      set({ error: error.message });
      throw error;
    }
    if (get().preparingInterviewId) throw new Error("已有面试正在准备中");

    const operationId = createOperationId();
    set({
      preparingInterviewId: id,
      preparationProgress: {
        interviewId: id,
        operationId,
        phase: "validating",
        message: "正在校验面试配置…",
      },
      error: null,
    });
    try {
      const session = await interviewGateway.prepareInterview({ interviewId: id, operationId, privacyConfirmed: true });
      set((state) => ({
        ...reconcileInterview(state.interviews, state.counts, session.interview),
        session: state.selectedId === id ? session : state.session,
        preparingInterviewId: null,
        preparationProgress: state.selectedId === id ? {
          interviewId: id,
          operationId,
          phase: "completed",
          message: "面试计划已准备完成。",
        } : state.preparationProgress,
      }));
      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      let recovered: InterviewSession | null = null;
      try {
        recovered = await interviewGateway.getInterviewSession(id);
      } catch {
        // The original preparation error is more useful than a secondary refresh failure.
      }
      set((state) => ({
        ...(recovered ? reconcileInterview(state.interviews, state.counts, recovered.interview) : {}),
        session: state.selectedId === id && recovered ? recovered : state.session,
        preparingInterviewId: null,
        preparationProgress: state.selectedId === id ? {
          interviewId: id,
          operationId,
          phase: "failed",
          message,
        } : state.preparationProgress,
        error: message,
      }));
      throw error;
    }
  },
  setPreparationProgress: (progress) => {
    if (progress.interviewId !== get().selectedId) return;
    set({ preparationProgress: progress });

    // A renderer reload loses the in-memory prepare promise while the main
    // process keeps working. Re-read the persisted terminal state when that
    // happens so the page cannot remain stuck on the old `preparing` snapshot.
    const isTerminal = progress.phase === "completed" || progress.phase === "failed";
    if (isTerminal && get().preparingInterviewId !== progress.interviewId) {
      void get().openInterview(progress.interviewId);
    }
  },
}));
