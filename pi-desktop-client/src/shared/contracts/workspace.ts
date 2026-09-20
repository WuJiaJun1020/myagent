export type WorkspaceEntryKind = "file" | "directory" | "symlink";

export type WorkspaceEntry = {
  name: string;
  path: string;
  kind: WorkspaceEntryKind;
  size?: number;
  modifiedAt?: number;
};

export type WorkspaceDirectoryListing = {
  path: string;
  entries: WorkspaceEntry[];
  truncated: boolean;
};

export type WorkspaceFileReference = {
  name: string;
  path: string;
};

export type WorkspaceTextFile = {
  name: string;
  path: string;
  content: string;
  size: number;
  modifiedAt: number;
  truncated: boolean;
};

export type WorkspaceFileSaveRequest = {
  path: string;
  content: string;
  /** The mtime observed when the file was opened. Used to prevent overwriting an external edit. */
  expectedModifiedAt: number;
};

export type FileChangeType = "created" | "modified" | "deleted" | "renamed";

export type FileChange = {
  path: string;
  changeType: FileChangeType;
  beforeContent?: string;
  afterContent?: string;
  unifiedDiff: string;
  /** Present only for legacy tool-attributed changes. Turn snapshots are tool agnostic. */
  toolCallId?: string;
  timestamp: number;
  truncated?: boolean;
};

export type WorkspaceGitFile = {
  path: string;
  indexStatus: string;
  workTreeStatus: string;
  renamedFrom?: string;
  additions: number;
  deletions: number;
  stagedAdditions?: number;
  stagedDeletions?: number;
  unstagedAdditions?: number;
  unstagedDeletions?: number;
  binary: boolean;
};

export type WorkspaceGitStatus = {
  available: boolean;
  branch?: string;
  ahead?: number;
  behind?: number;
  additions?: number;
  deletions?: number;
  files: WorkspaceGitFile[];
  error?: string;
};

export type WorkspaceGitDiffScope = "uncommitted" | "unstaged" | "staged";

export type WorkspaceGitDiff = {
  path: string;
  staged: boolean;
  scope?: WorkspaceGitDiffScope;
  diff: string;
  truncated: boolean;
};
