import { describe, expect, it } from "vitest";
import type { FileChange } from "../../../shared/contracts/workspace";
import { agentChangesInRevertOrder, summarizeAgentFileChanges } from "./AgentChangeReview";

function change(path: string, timestamp: number, diff: string): FileChange {
  return {
    path,
    timestamp,
    unifiedDiff: diff,
    toolCallId: `${path}:${timestamp}`,
    changeType: "modified",
    beforeContent: "before",
    afterContent: "after",
  };
}

describe("AgentChangeReview", () => {
  it("groups repeated edits by file and totals their changed lines", () => {
    const summary = summarizeAgentFileChanges([
      change("src/a.ts", 1, "@@ -1 +1 @@\n-old\n+new"),
      change("src/b.ts", 2, "@@ -1,0 +1,2 @@\n+one\n+two"),
      change("src/a.ts", 3, "@@ -2 +2 @@\n-before\n+after"),
    ]);

    expect(summary).toEqual({
      files: [
        { path: "src/a.ts", additions: 2, deletions: 2 },
        { path: "src/b.ts", additions: 2, deletions: 0 },
      ],
      additions: 4,
      deletions: 2,
    });
  });

  it("reverts newest edits first, including equal-timestamp events", () => {
    const first = change("src/a.ts", 10, "");
    const second = change("src/a.ts", 10, "");
    const latest = change("src/b.ts", 20, "");

    expect(agentChangesInRevertOrder([first, second, latest])).toEqual([latest, second, first]);
  });
});
