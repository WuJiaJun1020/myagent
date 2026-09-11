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

export type WorkspaceTextFile = {
  name: string;
  path: string;
  content: string;
  size: number;
  modifiedAt: number;
  truncated: boolean;
};

export type FileChangeType = "created" | "modified" | "deleted" | "renamed";

export type FileChange = {
  path: string;
  changeType: FileChangeType;
  beforeContent?: string;
  afterContent?: string;
  unifiedDiff: string;
  toolCallId: string;
  timestamp: number;
  truncated?: boolean;
};
