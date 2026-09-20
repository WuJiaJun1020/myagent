import { describe, expect, it } from "vitest";
import type { WorkspaceGitFile } from "../../../shared/contracts/workspace";
import { buildReviewTree, reviewFileMatchesScope, reviewFileStats } from "./GitReview";

function file(path: string, indexStatus: string, workTreeStatus: string): WorkspaceGitFile {
  return {
    path,
    indexStatus,
    workTreeStatus,
    additions: 9,
    deletions: 7,
    stagedAdditions: 3,
    stagedDeletions: 2,
    unstagedAdditions: 6,
    unstagedDeletions: 5,
    binary: false,
  };
}

describe("Git review presentation", () => {
  it("separates staged and unstaged views for a partially staged file", () => {
    const changed = file("src/app.ts", "M", "M");

    expect(reviewFileMatchesScope(changed, "staged")).toBe(true);
    expect(reviewFileMatchesScope(changed, "unstaged")).toBe(true);
    expect(reviewFileStats(changed, "staged")).toEqual({ additions: 3, deletions: 2 });
    expect(reviewFileStats(changed, "unstaged")).toEqual({ additions: 6, deletions: 5 });
  });

  it("builds the right-side file hierarchy from workspace paths", () => {
    const tree = buildReviewTree([
      file("src/main/index.ts", " ", "M"),
      file("src/renderer/App.tsx", " ", "M"),
      file("README.md", "?", "?"),
    ]);

    expect(tree.map((node) => [node.kind, node.name])).toEqual([
      ["directory", "src"],
      ["file", "README.md"],
    ]);
    expect(tree[0]?.children?.map((node) => node.name)).toEqual(["main", "renderer"]);
  });
});
