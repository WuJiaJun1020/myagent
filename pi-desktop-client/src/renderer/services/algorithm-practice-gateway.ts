import type {
  AlgorithmPracticeSnapshot,
  AlgorithmProblemDetail,
  AlgorithmResetDraftRequest,
  AlgorithmRunRequest,
  AlgorithmRunResult,
  AlgorithmSaveDraftRequest,
} from "../../shared/contracts/algorithm-practice";

export interface AlgorithmPracticeGateway {
  getSnapshot(): Promise<AlgorithmPracticeSnapshot>;
  getProblem(slug: string): Promise<AlgorithmProblemDetail>;
  saveDraft(request: AlgorithmSaveDraftRequest): Promise<void>;
  resetDraft(request: AlgorithmResetDraftRequest): Promise<void>;
  run(request: AlgorithmRunRequest): Promise<AlgorithmRunResult>;
}

// Keep this adapter independently type-safe while the preload surface and
// renderer can be implemented in parallel.
type AlgorithmPracticeDesktopApi = typeof window.piDesktop & {
  getAlgorithmPracticeSnapshot(): Promise<AlgorithmPracticeSnapshot>;
  getAlgorithmProblem(slug: string): Promise<AlgorithmProblemDetail>;
  saveAlgorithmDraft(request: AlgorithmSaveDraftRequest): Promise<void>;
  resetAlgorithmDraft(request: AlgorithmResetDraftRequest): Promise<void>;
  runAlgorithmCode(request: AlgorithmRunRequest): Promise<AlgorithmRunResult>;
};

function desktopApi(): AlgorithmPracticeDesktopApi {
  return window.piDesktop as AlgorithmPracticeDesktopApi;
}

class DesktopAlgorithmPracticeGateway implements AlgorithmPracticeGateway {
  getSnapshot(): Promise<AlgorithmPracticeSnapshot> {
    return desktopApi().getAlgorithmPracticeSnapshot();
  }

  getProblem(slug: string): Promise<AlgorithmProblemDetail> {
    return desktopApi().getAlgorithmProblem(slug);
  }

  saveDraft(request: AlgorithmSaveDraftRequest): Promise<void> {
    return desktopApi().saveAlgorithmDraft(request);
  }

  resetDraft(request: AlgorithmResetDraftRequest): Promise<void> {
    return desktopApi().resetAlgorithmDraft(request);
  }

  run(request: AlgorithmRunRequest): Promise<AlgorithmRunResult> {
    return desktopApi().runAlgorithmCode(request);
  }
}

export const algorithmPracticeGateway: AlgorithmPracticeGateway = new DesktopAlgorithmPracticeGateway();
