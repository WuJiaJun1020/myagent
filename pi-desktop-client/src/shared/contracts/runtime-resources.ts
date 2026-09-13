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

export type RuntimeCommandResource = {
  name: string;
  description?: string;
  argumentHint?: string;
  kind: "skill" | "prompt";
  source: RuntimeToolSource;
};

export type RuntimeExtensionSummary = {
  id: string;
  name: string;
  path: string;
  source: RuntimeToolSource;
  toolNames: string[];
  commandNames: string[];
};

export type RuntimePackageScope = "user" | "project";
export type RuntimeManagedResourceType = "extensions" | "skills" | "prompts" | "themes";

export type RuntimePackageSummary = {
  id: string;
  source: string;
  scope: RuntimePackageScope;
  filtered: boolean;
  installed: boolean;
  installedPath?: string;
};

export type RuntimeManagedResource = {
  id: string;
  type: RuntimeManagedResourceType;
  name: string;
  path: string;
  displayPath: string;
  enabled: boolean;
  sourceId: string;
  source: RuntimeToolSource;
};

export type RuntimeResourceMutation =
  | { type: "install"; source: string; scope: RuntimePackageScope }
  | { type: "remove"; source: string; scope: RuntimePackageScope }
  | { type: "update"; source: string; scope: RuntimePackageScope }
  | {
      type: "set-enabled";
      resourceType: RuntimeManagedResourceType;
      path: string;
      source: string;
      scope: RuntimePackageScope;
      enabled: boolean;
    };

export type RuntimeResourceSnapshot = {
  capabilities: {
    nativeMcp: boolean;
    semanticMemory: boolean;
  };
  tools: RuntimeToolSummary[];
  mcpServers: McpServerSummary[];
  memories: MemoryResource[];
  commandResources: RuntimeCommandResource[];
  extensions: RuntimeExtensionSummary[];
  packages: RuntimePackageSummary[];
  managedResources: RuntimeManagedResource[];
  projectTrusted: boolean;
  issues: RuntimeResourceIssue[];
  updatedAt: number;
};
