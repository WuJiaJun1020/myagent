import { describe, expect, it } from "vitest";
import type { ToolCallState } from "../../lib/event-reducer";
import { resolveToolRenderer } from "./ToolRenderer";

function tool(name: string, args: Record<string, unknown>): ToolCallState {
  return { id: name, name, args, output: [], status: "running", startedAt: 1 };
}

describe("Tool renderer registry", () => {
  it("selects specialized renderers for terminal, files, and search", () => {
    expect(resolveToolRenderer(tool("bash", { command: "npm test" })).present(tool("bash", { command: "npm test" }))).toMatchObject({
      category: "terminal",
      summary: "npm test",
    });
    expect(resolveToolRenderer(tool("read", { path: "src/App.tsx" })).present(tool("read", { path: "src/App.tsx" })).category).toBe("read");
    expect(resolveToolRenderer(tool("apply_patch", { path: "src/App.tsx" })).present(tool("apply_patch", { path: "src/App.tsx" })).category).toBe("edit");
    expect(resolveToolRenderer(tool("grep", { pattern: "AgentEvent" })).present(tool("grep", { pattern: "AgentEvent" })).category).toBe("search");
  });

  it("falls back to the generic renderer for unknown tools", () => {
    const unknown = tool("custom.mcp.tool", { subject: "candidate" });
    expect(resolveToolRenderer(unknown).present(unknown)).toEqual({
      category: "generic",
      label: "custom.mcp.tool",
      summary: "candidate",
    });
  });
});
