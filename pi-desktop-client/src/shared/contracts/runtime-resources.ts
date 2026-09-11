export type RuntimeSourceScope = "builtin" | "user" | "project" | "temporary";
export type RuntimeToolSourceKind = "builtin" | "extension" | "mcp" | "sdk";
export type RuntimeToolPermission = "workspace-read" | "workspace-write" | "process" | "external-service";

export type RuntimeToolSource = {
  kind: RuntimeToolSourceKind;
  label: string;
  scope: RuntimeSourceScope;
  origin: "package" | "top-level";
  path: string;
};

export type RuntimeToolSummary = {
  name: string;
  description?: string;
  active: boolean;
  permissions: RuntimeToolPermission[];
  source: RuntimeToolSource;
};

export type McpServerSummary = {
  id: string;
  name: string;
  source: string;
  scope: RuntimeSourceScope;
  status: "loaded" | "error";
  statusDetail: string;
  toolNames: string[];
};

export type MemoryResource = {
  id: string;
  name: string;
  kind: "instructions" | "system" | "append-system";
  scope: "user" | "workspace" | "ancestor";
  source: string;
  content: string;
  truncated: boolean;
  enabled: true;
};

export type RuntimeResourceIssue = {
  source: string;
  message: string;
};

export type RuntimeResourceSnapshot = {
  capabilities: {
    nativeMcp: boolean;
    semanticMemory: boolean;
  };
  tools: RuntimeToolSummary[];
  mcpServers: McpServerSummary[];
  memories: MemoryResource[];
  issues: RuntimeResourceIssue[];
  updatedAt: number;
};
