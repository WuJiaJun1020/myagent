import { create } from "zustand";
import type {
  QuestionBankListQuery,
  QuestionBankQuestionDetail,
  QuestionBankQuestionSummary,
  QuestionBankSnapshot,
} from "../../shared/contracts/interview-question-bank";
import type {
  InterviewQuestionDifficulty,
  InterviewQuestionKind,
} from "../../shared/contracts/interview";
import { questionBankGateway } from "../services/question-bank-gateway";

export const QUESTION_BANK_PAGE_SIZE = 30;

export type QuestionBankFilters = {
  search: string;
  kind?: InterviewQuestionKind;
  difficulty?: InterviewQuestionDifficulty;
  role?: string;
  skill?: string;
  favoritesOnly: boolean;
};

const INITIAL_FILTERS: QuestionBankFilters = {
  search: "",
  favoritesOnly: false,
};

type QuestionBankStore = {
  snapshot: QuestionBankSnapshot | null;
  items: QuestionBankQuestionSummary[];
  total: number;
  hasMore: boolean;
  initialized: boolean;
  snapshotError: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  filters: QuestionBankFilters;
  selectedId: string | null;
  detail: QuestionBankQuestionDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  favoritePendingIds: Set<string>;
  favoriteError: string | null;
  initialize: (force?: boolean) => Promise<void>;
  setFilters: (filters: Partial<QuestionBankFilters>) => Promise<void>;
  loadMore: () => Promise<void>;
  selectQuestion: (id: string, force?: boolean) => Promise<QuestionBankQuestionDetail | null>;
  toggleFavorite: (id: string) => Promise<void>;
  clearFavoriteError: () => void;
};

let listLoadSequence = 0;
let detailLoadSequence = 0;
let snapshotLoadSequence = 0;
let favoriteMutationRevision = 0;
const favoriteMutationRevisionById = new Map<string, number>();

type FavoriteRequestState = {
  revision: number;
  pendingIds: Set<string>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toQuery(filters: QuestionBankFilters, offset = 0): QuestionBankListQuery {
  const search = filters.search.trim();
  return {
    ...(search ? { search } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.skill ? { skill: filters.skill } : {}),
    ...(filters.favoritesOnly ? { favoritesOnly: true } : {}),
    limit: QUESTION_BANK_PAGE_SIZE,
    offset,
  };
}

function mergeUnique(
  current: QuestionBankQuestionSummary[],
  incoming: QuestionBankQuestionSummary[],
): QuestionBankQuestionSummary[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

function withFavorite<T extends QuestionBankQuestionSummary>(item: T, id: string, favorite: boolean): T {
  return item.id === id ? { ...item, favorite } : item;
}

function captureFavoriteRequestState(pendingIds: Set<string>): FavoriteRequestState {
  return { revision: favoriteMutationRevision, pendingIds: new Set(pendingIds) };
}

function preserveNewerFavorite<T extends QuestionBankQuestionSummary>(
  item: T,
  requestState: FavoriteRequestState,
  currentItems: QuestionBankQuestionSummary[],
  currentDetail: QuestionBankQuestionDetail | null,
): T {
  const changedAfterRequest = (favoriteMutationRevisionById.get(item.id) ?? 0) > requestState.revision;
  if (!changedAfterRequest && !requestState.pendingIds.has(item.id)) return item;
  const favorite = currentItems.find((current) => current.id === item.id)?.favorite
    ?? (currentDetail?.id === item.id ? currentDetail.favorite : undefined);
  return favorite === undefined ? item : { ...item, favorite };
}

export const useQuestionBankStore = create<QuestionBankStore>((set, get) => ({
  snapshot: null,
  items: [],
  total: 0,
  hasMore: false,
  initialized: false,
  snapshotError: null,
  loading: false,
  loadingMore: false,
  error: null,
  filters: { ...INITIAL_FILTERS },
  selectedId: null,
  detail: null,
  detailLoading: false,
  detailError: null,
  favoritePendingIds: new Set(),
  favoriteError: null,

  initialize: async (force = false) => {
    if (get().loading || (get().initialized && get().snapshot && !force)) return;
    const requestSequence = ++listLoadSequence;
    const snapshotRequestSequence = ++snapshotLoadSequence;
    const filters = get().filters;
    const favoriteRequestState = captureFavoriteRequestState(get().favoritePendingIds);
    set({ loading: true, loadingMore: false, error: null, snapshotError: null });
    try {
      const [snapshotResult, listResult] = await Promise.allSettled([
        questionBankGateway.getSnapshot(),
        questionBankGateway.listQuestions(toQuery(filters)),
      ]);
      if (snapshotResult.status === "fulfilled" && snapshotRequestSequence === snapshotLoadSequence) {
        const favoriteStateChanged = favoriteMutationRevision !== favoriteRequestState.revision
          || favoriteRequestState.pendingIds.size > 0;
        set((current) => ({
          snapshot: favoriteStateChanged ? current.snapshot : snapshotResult.value,
          snapshotError: null,
        }));
      } else if (snapshotResult.status === "rejected" && snapshotRequestSequence === snapshotLoadSequence) {
        set({ snapshotError: errorMessage(snapshotResult.reason) });
      }
      if (requestSequence !== listLoadSequence) return;
      if (snapshotResult.status === "rejected" && snapshotRequestSequence === snapshotLoadSequence) {
        throw snapshotResult.reason;
      }
      if (listResult.status === "rejected") throw listResult.reason;
      const result = listResult.value;
      const currentState = get();
      const items = result.items.map((item) => preserveNewerFavorite(
        item,
        favoriteRequestState,
        currentState.items,
        currentState.detail,
      ));
      const previousSelectedId = get().selectedId;
      const selectedId = previousSelectedId && items.some((item) => item.id === previousSelectedId)
        ? previousSelectedId
        : items[0]?.id ?? null;
      set({
        items,
        total: result.total,
        hasMore: result.hasMore,
        initialized: true,
        loading: false,
        loadingMore: false,
        error: null,
        selectedId,
        ...(!selectedId ? { detail: null, detailLoading: false, detailError: null } : {}),
      });
      if (selectedId && get().detail?.id !== selectedId) {
        await get().selectQuestion(selectedId);
      }
    } catch (error) {
      if (requestSequence === listLoadSequence) {
        set({ loading: false, loadingMore: false, error: errorMessage(error) });
      }
    }
  },

  setFilters: async (patch) => {
    const filters = { ...get().filters, ...patch };
    const requestSequence = ++listLoadSequence;
    const favoriteRequestState = captureFavoriteRequestState(get().favoritePendingIds);
    set({ filters, loading: true, loadingMore: false, error: null });
    try {
      const result = await questionBankGateway.listQuestions(toQuery(filters));
      if (requestSequence !== listLoadSequence) return;
      const currentState = get();
      const items = result.items.map((item) => preserveNewerFavorite(
        item,
        favoriteRequestState,
        currentState.items,
        currentState.detail,
      ));
      const previousSelectedId = get().selectedId;
      const selectedId = previousSelectedId && items.some((item) => item.id === previousSelectedId)
        ? previousSelectedId
        : items[0]?.id ?? null;
      set({
        items,
        total: result.total,
        hasMore: result.hasMore,
        initialized: true,
        loading: false,
        error: null,
        selectedId,
        ...(!selectedId ? { detail: null, detailLoading: false, detailError: null } : {}),
      });
      if (selectedId && get().detail?.id !== selectedId) {
        await get().selectQuestion(selectedId);
      }
    } catch (error) {
      if (requestSequence === listLoadSequence) {
        set({ loading: false, error: errorMessage(error) });
      }
    }
  },

  loadMore: async () => {
    const state = get();
    if (state.loading || state.loadingMore || !state.hasMore) return;
    const requestSequence = ++listLoadSequence;
    const offset = state.items.length;
    const favoriteRequestState = captureFavoriteRequestState(state.favoritePendingIds);
    set({ loadingMore: true, error: null });
    try {
      const result = await questionBankGateway.listQuestions(toQuery(state.filters, offset));
      if (requestSequence !== listLoadSequence) return;
      set((current) => {
        const items = result.items.map((item) => preserveNewerFavorite(
          item,
          favoriteRequestState,
          current.items,
          current.detail,
        ));
        return {
          items: mergeUnique(current.items, items),
          total: result.total,
          hasMore: result.hasMore,
          loadingMore: false,
        };
      });
    } catch (error) {
      if (requestSequence === listLoadSequence) {
        set({ loadingMore: false, error: errorMessage(error) });
      }
    }
  },

  selectQuestion: async (id, force = false) => {
    const state = get();
    if (!force && state.selectedId === id && state.detail?.id === id) return state.detail;
    const requestSequence = ++detailLoadSequence;
    const favoriteRequestState = captureFavoriteRequestState(state.favoritePendingIds);
    set({ selectedId: id, detail: null, detailLoading: true, detailError: null });
    try {
      let detail = await questionBankGateway.getQuestion(id);
      if (requestSequence !== detailLoadSequence || get().selectedId !== id) return detail;
      if (!detail) {
        set({ detailLoading: false, detailError: "找不到这道题，它可能已被停用或删除。" });
        return null;
      }
      const currentState = get();
      detail = preserveNewerFavorite(
        detail,
        favoriteRequestState,
        currentState.items,
        currentState.detail,
      );
      set({ detail, detailLoading: false, detailError: null });
      return detail;
    } catch (error) {
      if (requestSequence === detailLoadSequence && get().selectedId === id) {
        set({ detailLoading: false, detailError: errorMessage(error) });
      }
      return null;
    }
  },

  toggleFavorite: async (id) => {
    const state = get();
    if (state.favoritePendingIds.has(id)) return;
    const summary = state.items.find((item) => item.id === id);
    const detail = state.detail?.id === id ? state.detail : null;
    const previousFavorite = summary?.favorite ?? detail?.favorite;
    if (previousFavorite === undefined) return;
    const favorite = !previousFavorite;
    favoriteMutationRevision += 1;
    favoriteMutationRevisionById.set(id, favoriteMutationRevision);
    set((current) => ({
      items: current.items.map((item) => withFavorite(item, id, favorite)),
      detail: current.detail ? withFavorite(current.detail, id, favorite) : null,
      snapshot: current.snapshot ? {
        ...current.snapshot,
        favorites: Math.max(0, current.snapshot.favorites + (favorite ? 1 : -1)),
      } : null,
      favoritePendingIds: new Set([...current.favoritePendingIds, id]),
      favoriteError: null,
    }));
    try {
      const result = await questionBankGateway.setFavorite({ questionId: id, favorite });
      set((current) => {
        const pending = new Set(current.favoritePendingIds);
        pending.delete(id);
        return {
          items: current.items.map((item) => withFavorite(item, id, result.favorite)),
          detail: current.detail ? withFavorite(current.detail, id, result.favorite) : null,
          favoritePendingIds: pending,
        };
      });
      if (get().filters.favoritesOnly && !result.favorite) {
        set((current) => {
          const contained = current.items.some((item) => item.id === id);
          const items = current.items.filter((item) => item.id !== id);
          const selectionChanged = current.selectedId === id;
          const selectedId = selectionChanged ? items[0]?.id ?? null : current.selectedId;
          return {
            items,
            total: Math.max(0, current.total - (contained ? 1 : 0)),
            selectedId,
            ...(selectionChanged || !selectedId
              ? { detail: null, detailLoading: false, detailError: null }
              : {}),
          };
        });
        await get().setFilters({});
      }
    } catch (error) {
      set((current) => {
        const pending = new Set(current.favoritePendingIds);
        pending.delete(id);
        return {
          items: current.items.map((item) => withFavorite(item, id, previousFavorite)),
          detail: current.detail ? withFavorite(current.detail, id, previousFavorite) : null,
          snapshot: current.snapshot ? {
            ...current.snapshot,
            favorites: Math.max(0, current.snapshot.favorites + (favorite ? -1 : 1)),
          } : null,
          favoritePendingIds: pending,
          favoriteError: errorMessage(error),
        };
      });
    }
    const stateAfterMutation = get();
    if (!stateAfterMutation.snapshot && stateAfterMutation.favoritePendingIds.size === 0) {
      const revision = favoriteMutationRevision;
      const snapshotRequestSequence = ++snapshotLoadSequence;
      try {
        const snapshot = await questionBankGateway.getSnapshot();
        if (snapshotRequestSequence === snapshotLoadSequence
          && revision === favoriteMutationRevision
          && get().favoritePendingIds.size === 0) {
          set({ snapshot, snapshotError: null });
        }
      } catch (error) {
        if (snapshotRequestSequence === snapshotLoadSequence && !get().snapshot) {
          set({ snapshotError: errorMessage(error) });
        }
      }
    }
  },

  clearFavoriteError: () => set({ favoriteError: null }),
}));
