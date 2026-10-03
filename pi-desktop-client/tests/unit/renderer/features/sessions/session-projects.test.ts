import { describe, expect, it } from "vitest";
import type { SessionListItem } from "../../../../../src/shared/contracts/agent-session";
import { groupSessionProjects } from "../../../../../src/renderer/features/sessions/session-projects";

const item = (id: string, cwd: string, modifiedAt: number, mode: "work" | "chat" = "work"): SessionListItem => ({
  id, mode, scope: mode === "work" ? "workspace" : "global", firstMessage: id,
  createdAt: 0, modifiedAt, messageCount: 1, current: false,
  workspace: { cwd, name: "app", current: false, available: true },
});

describe("project session navigation", () => {
  it("keeps saved order across workspace switches and session activity, appending new projects", () => {
    const directories = ["C:/one", "D:/two", "E:/three"];
    const sessions = [item("a", directories[0], 1), item("b", directories[1], 9)];
    for (const cwd of directories) {
      const groups = groupSessionProjects(sessions, cwd, directories);
      expect(groups.map((group) => group.cwd)).toEqual(directories);
      expect(groups.filter((group) => group.current).map((group) => group.cwd)).toEqual([cwd]);
    }
    expect(groupSessionProjects([...sessions].reverse(), "F:/new", directories).map((group) => group.cwd))
      .toEqual([...directories, "F:/new"]);
  });
  it("retains multiple saved empty projects and deduplicates the current workspace", () => {
    const projects = groupSessionProjects([], "C:/one", ["c:\\one", "D:/two", "E:/three"]);
    expect(projects.map((project) => project.key)).toEqual(["c:/one", "d:/two", "e:/three"]);
    expect(projects.every((project) => project.sessions.length === 0)).toBe(true);
  });
  it("groups Windows path variants without merging same-name projects or chats", () => {
    const groups = groupSessionProjects([
      item("old", "C:\\one\\app", 1), item("new", "c:/one/app/", 3),
      item("other", "D:/two/app", 4), item("chat", "C:/one/app", 5, "chat"),
    ], "C:/one/app");
    expect(groups).toHaveLength(2);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(["new", "old"]);
    expect(groups[0].current).toBe(true);
    expect(groups[1].sessions[0].id).toBe("other");
  });
  it("keeps an empty current workspace and unavailable history visible", () => {
    const missing = item("missing", "D:/missing/app", 1);
    missing.workspace!.available = false;
    const groups = groupSessionProjects([missing], "C:/empty");
    expect(groups[0].sessions).toEqual([]);
    expect(groups[1].sessions[0]).toBe(missing);
  });
  it("does not case-fold POSIX paths or merge unknown legacy paths", () => {
    const legacy = item("legacy", "", 1);
    expect(groupSessionProjects([item("a", "/A/app", 1), item("b", "/a/app", 2), legacy, { ...legacy, id: "legacy2" }], "")).toHaveLength(4);
  });
});
