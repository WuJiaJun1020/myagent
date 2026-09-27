import { create } from "zustand";

export const useBrowserStore = create<{
  open: boolean;
  request?: { url: string; id: number };
  show: (url?: string) => void;
  close: () => void;
  consumeRequest: () => void;
}>((set) => ({
  open: false,
  show: (url) => set(state => ({ open: true, request: url ? { url, id: (state.request?.id ?? 0) + 1 } : state.request })),
  close: () => set({ open: false }),
  consumeRequest: () => set({ request: undefined }),
}));
