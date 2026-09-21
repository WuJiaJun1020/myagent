import type {
  InterviewCreateRequest,
  InterviewPreparationProgress,
  InterviewPrepareRequest,
  InterviewRecord,
  InterviewSession,
  InterviewSnapshot,
  JobCollectionProgress,
  JobCollectionRequest,
  JobCollectionResult,
  JobLibrarySnapshot,
} from "../../shared/contracts/interview";

export interface InterviewGateway {
  getSnapshot(): Promise<InterviewSnapshot>;
  getInterview(id: string): Promise<InterviewRecord | null>;
  getInterviewSession(id: string): Promise<InterviewSession | null>;
  createInterview(request: InterviewCreateRequest): Promise<InterviewRecord>;
  prepareInterview(request: InterviewPrepareRequest): Promise<InterviewSession>;
  onPreparationProgress(listener: (progress: InterviewPreparationProgress) => void): () => void;
  getJobLibrary(): Promise<JobLibrarySnapshot>;
  collectJobs(request: JobCollectionRequest): Promise<JobCollectionResult>;
  onJobCollectionProgress(listener: (progress: JobCollectionProgress) => void): () => void;
}

// Keep the renderer adapter independently type-safe while preload and the shared
// desktop API evolve in lockstep in their own module.
type InterviewDesktopApi = typeof window.piDesktop & {
  getInterviewSession(id: string): Promise<InterviewSession | null>;
  prepareInterview(request: InterviewPrepareRequest): Promise<InterviewSession>;
  onInterviewPreparationProgress(listener: (progress: InterviewPreparationProgress) => void): () => void;
};

function desktopApi(): InterviewDesktopApi {
  return window.piDesktop as InterviewDesktopApi;
}

class DesktopInterviewGateway implements InterviewGateway {
  getSnapshot(): Promise<InterviewSnapshot> {
    return window.piDesktop.getInterviewSnapshot();
  }

  getInterview(id: string): Promise<InterviewRecord | null> {
    return window.piDesktop.getInterview(id);
  }

  getInterviewSession(id: string): Promise<InterviewSession | null> {
    return desktopApi().getInterviewSession(id);
  }

  createInterview(request: InterviewCreateRequest): Promise<InterviewRecord> {
    return window.piDesktop.createInterview(request);
  }

  prepareInterview(request: InterviewPrepareRequest): Promise<InterviewSession> {
    return desktopApi().prepareInterview(request);
  }

  onPreparationProgress(listener: (progress: InterviewPreparationProgress) => void): () => void {
    return desktopApi().onInterviewPreparationProgress(listener);
  }

  getJobLibrary(): Promise<JobLibrarySnapshot> {
    return window.piDesktop.getJobLibrary();
  }

  collectJobs(request: JobCollectionRequest): Promise<JobCollectionResult> {
    return window.piDesktop.collectJobs(request);
  }

  onJobCollectionProgress(listener: (progress: JobCollectionProgress) => void): () => void {
    return window.piDesktop.onJobCollectionProgress(listener);
  }
}

export const interviewGateway: InterviewGateway = new DesktopInterviewGateway();
