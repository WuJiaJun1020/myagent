import type { WorkspaceDirectoryListing, WorkspaceTextFile } from "../../shared/contracts/workspace";

export interface WorkspaceGateway {
  listDirectory(path: string): Promise<WorkspaceDirectoryListing>;
  readFile(path: string): Promise<WorkspaceTextFile>;
}

class DesktopWorkspaceGateway implements WorkspaceGateway {
  listDirectory(path: string): Promise<WorkspaceDirectoryListing> {
    return window.piDesktop.listWorkspaceDirectory(path);
  }

  readFile(path: string): Promise<WorkspaceTextFile> {
    return window.piDesktop.readWorkspaceFile(path);
  }
}

export const workspaceGateway: WorkspaceGateway = new DesktopWorkspaceGateway();
