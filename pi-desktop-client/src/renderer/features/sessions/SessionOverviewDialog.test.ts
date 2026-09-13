import { describe, expect, it } from "vitest";
import type { SessionTreeNode } from "../../../shared/contracts/agent-session";
import { flattenSessionTree } from "./SessionOverviewDialog";

function node(id: string, children: SessionTreeNode[] = []): SessionTreeNode {
  return { id, type: "message", preview: id, children };
}

describe("session overview branch layout", () => {
  it("keeps a long linear message chain aligned instead of drifting right", () => {
    const root = node("0");
    let cursor = root;
    for (let index = 1; index < 80; index += 1) {
      const child = node(String(index));
      cursor.children = [child];
      cursor = child;
    }

    const rows = flattenSessionTree([root]);

    expect(rows).toHaveLength(80);
    expect(rows.every((row) => row.depth === 0)).toBe(true);
    expect(rows.at(-1)?.level).toBe(80);
  });

  it("indents real branches while keeping their subsequent linear chains aligned", () => {
    const tree = node("root", [
      node("branch-a", [node("a-2", [node("a-3")])]),
      node("branch-b", [node("b-2")]),
    ]);

    expect(flattenSessionTree([tree]).map((row) => [row.node.id, row.depth])).toEqual([
      ["root", 0],
      ["branch-a", 1],
      ["a-2", 2],
      ["a-3", 2],
      ["branch-b", 1],
      ["b-2", 2],
    ]);
  });
});
