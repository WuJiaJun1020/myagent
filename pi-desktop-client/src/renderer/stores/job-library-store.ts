import { create } from "zustand";
import type {
  JobCollectionProgress,
  JobCollectionRequest,
  JobLibrarySnapshot,
} from "../../shared/contracts/interview";
import { interviewGateway } from "../services/interview-gateway";

const EMPTY_LIBRARY: JobLibrarySnapshot = {
  jobs: [],
  total: 0,
  bySource: { alibaba: 0, bytedance: 0 },
  lastRun: null,
};

type JobLibraryStore = JobLibrarySnapshot & {
  initialized: boolean;
  loading: boolean;
  collecting: boolean;
  error: string | null;
  progress: JobCollectionProgress | null;
  initialize: (force?: boolean) => Promise<void>;
  collect: (request: JobCollectionRequest) => Promise<void>;
  setProgress: (progress: JobCollectionProgress) => void;
};

export const useJobLibraryStore = create<JobLibraryStore>((set, get) => ({
  ...EMPTY_LIBRARY,
  initialized: false,
  loading: false,
  collecting: false,
  error: null,
  progress: null,
  initialize: async (force = false) => {
    if (get().loading || (get().initialized && !force)) return;
    set({ loading: true, error: null });
    try {
      const snapshot = await interviewGateway.getJobLibrary();
      set({ ...snapshot, initialized: true, loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },
  collect: async (request) => {
    if (get().collecting) return;
    set({ collecting: true, error: null, progress: null });
    try {
      const result = await interviewGateway.collectJobs(request);
      set({ ...result.snapshot, initialized: true, collecting: false });
    } catch (error) {
      set({ collecting: false, error: error instanceof Error ? error.message : String(error) });
    }
  },
  setProgress: (progress) => set({ progress }),
}));
