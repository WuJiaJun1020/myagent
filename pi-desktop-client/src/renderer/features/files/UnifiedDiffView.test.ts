import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  countUnifiedDiffChanges,
  parseUnifiedDiff,
  shouldVirtualizeUnifiedDiff,
  UnifiedDiffView,
} from "./UnifiedDiffView";

const diff = [
  "diff --git a/example.ts b/example.ts",
  "--- a/example.ts",
  "+++ b/example.ts",
  "@@ -2,3 +2,4 @@",
  " keep",
  "-old",
  "+new",
  "+extra",
  " end",
].join("\n");

describe("unified diff presentation", () => {
  it("counts only changed content lines", () => {
    expect(countUnifiedDiffChanges(diff)).toEqual({ additions: 2, deletions: 1 });
  });

  it("tracks old and new line numbers through a hunk", () => {
    const lines = parseUnifiedDiff(diff);
    expect(lines.slice(4)).toMatchObject([
      { kind: "context", oldLine: 2, newLine: 2 },
      { kind: "remove", oldLine: 3 },
      { kind: "add", newLine: 3 },
      { kind: "add", newLine: 4 },
      { kind: "context", oldLine: 4, newLine: 5 },
    ]);
  });

  it("reports omitted context using Codex-style collapsed sections", () => {
    const lines = parseUnifiedDiff([
      "@@ -4,2 +4,2 @@",
      " old",
      "+new",
      "@@ -20,2 +20,2 @@",
      " old again",
      "+new again",
    ].join("\n"));

    expect(lines.filter((line) => line.kind === "hunk").map((line) => line.collapsedLines)).toEqual([3, 14]);
  });

  it("renders syntax tokens and an interactive context expander", () => {
    const html = renderToStaticMarkup(
      createElement(UnifiedDiffView, {
        diff: ["@@ -8 +8 @@", "-const oldValue = 1;", "+const nextValue = 2;"].join("\n"),
        path: "src/example.ts",
        onExpandContext: () => undefined,
      }),
    );

    expect(html).toContain("点击展开");
    expect(html).toContain('class="token keyword"');
    expect(html).toContain("nextValue");
  });

  it("virtualizes only large diffs when the host requests it", () => {
    expect(shouldVirtualizeUnifiedDiff(120, true)).toBe(false);
    expect(shouldVirtualizeUnifiedDiff(121, true)).toBe(true);
    expect(shouldVirtualizeUnifiedDiff(4_000, false)).toBe(false);
  });
});
