import { describe, expect, it } from "vitest";
import { adaptPiResources } from "./pi-resource-service";

describe("adaptPiResources", () => {
  it("classifies built-in and MCP tools while preserving runtime activation", () => {
    const cwd = "D:\\Code\\workspace";
    const snapshot = adaptPiResources({
      capabilities: { nativeMcp: false, semanticMemory: false },
      tools: [
        {
          name: "read",
          description: "Read a file",
          active: true,
          sourceInfo: { path: "<builtin:read>", source: "builtin", scope: "temporary", origin: "top-level" },
        },
        {
          name: "grep",
          description: "Search file contents",
          active: true,
          sourceInfo: { path: "<builtin:grep>", source: "builtin", scope: "temporary", origin: "top-level" },
        },
        {
          name: "github_search",
          description: "Search GitHub",
          active: true,
          sourceInfo: { path: "D:\\Extensions\\pi-mcp-github.ts", source: "npm:pi-mcp-github", scope: "user", origin: "package" },
        },
      ],
      extensions: [{
        path: "D:\\Extensions\\pi-mcp-github.ts",
        sourceInfo: { path: "D:\\Extensions\\pi-mcp-github.ts", source: "npm:pi-mcp-github", scope: "user", origin: "package" },
        toolNames: ["github_search"],
        commandNames: [],
      }],
      extensionErrors: [],
      contextResources: [],
    }, cwd);

    expect(snapshot.capabilities).toEqual({ nativeMcp: false, semanticMemory: false });
    expect(snapshot.tools[0]).toMatchObject({ name: "github_search", active: true, permissions: ["workspace-read", "external-service"], source: { kind: "mcp", scope: "user" } });
    expect(snapshot.tools.find((tool) => tool.name === "read")?.source.kind).toBe("builtin");
    expect(snapshot.tools.find((tool) => tool.name === "grep")?.permissions).toEqual(["workspace-read"]);
    expect(snapshot.mcpServers).toEqual([expect.objectContaining({
      name: "npm:pi-mcp-github",
      status: "loaded",
      toolNames: ["github_search"],
    })]);
  });

  it("maps loaded context files to distinct read-only memory resources", () => {
    const cwd = "D:\\Code\\workspace";
    const snapshot = adaptPiResources({
      capabilities: { nativeMcp: false, semanticMemory: false },
      tools: [],
      extensions: [],
      extensionErrors: [],
      contextResources: [
        { kind: "instructions", path: "D:\\Code\\workspace\\AGENTS.md", content: "Workspace rules" },
        { kind: "system", path: "D:\\Code\\.pi\\SYSTEM.md", content: "Parent system rules" },
      ],
    }, cwd);

    expect(snapshot.memories).toEqual([
      expect.objectContaining({ name: "AGENTS.md", scope: "workspace", kind: "instructions", content: "Workspace rules", enabled: true }),
      expect.objectContaining({ name: "SYSTEM.md", scope: "ancestor", kind: "system", content: "Parent system rules", enabled: true }),
    ]);
  });
});
