import type {
  FileChange,
  WorkspaceDirectoryListing,
  WorkspaceFileSaveRequest,
  WorkspaceFileReference,
  WorkspaceGitDiff,
  WorkspaceGitStatus,
  WorkspaceTextFile,
} from "../../shared/contracts/workspace";

export interface WorkspaceGateway {
  listDirectory(path: string): Promise<WorkspaceDirectoryListing>;
  searchFiles(query: string): Promise<WorkspaceFileReference[]>;
  readFile(path: string): Promise<WorkspaceTextFile>;
  saveFile(request: WorkspaceFileSaveRequest): Promise<WorkspaceTextFile>;
  revertAgentChange(change: FileChange): Promise<void>;
  getGitStatus(): Promise<WorkspaceGitStatus>;
  getGitDiff(path: string, staged: boolean): Promise<WorkspaceGitDiff>;
}

class DesktopWorkspaceGateway implements WorkspaceGateway {
  listDirectory(path: string): Promise<WorkspaceDirectoryListing> {
    return window.piDesktop.listWorkspaceDirectory(path);
  }

  searchFiles(query: string): Promise<WorkspaceFileReference[]> {
    return window.piDesktop.searchWorkspaceFiles(query);
  }

  readFile(path: string): Promise<WorkspaceTextFile> {
    return window.piDesktop.readWorkspaceFile(path);
  }

  saveFile(request: WorkspaceFileSaveRequest): Promise<WorkspaceTextFile> {
    return window.piDesktop.saveWorkspaceFile(request);
  }

  revertAgentChange(change: FileChange): Promise<void> {
    return window.piDesktop.revertAgentFileChange(change);
  }

  getGitStatus(): Promise<WorkspaceGitStatus> {
    return window.piDesktop.getWorkspaceGitStatus();
  }

  getGitDiff(path: string, staged: boolean): Promise<WorkspaceGitDiff> {
    return window.piDesktop.getWorkspaceGitDiff(path, staged);
  }

}

export const workspaceGateway: WorkspaceGateway = new DesktopWorkspaceGateway();
