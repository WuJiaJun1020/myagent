import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createUnifiedDiff, FileChangeTracker, WorkspaceFileService } from "./workspace-files";

const temporaryDirectories: string[] = [];

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "pi-desktop-workspace-"));
  temporaryDirectories.push(workspace);
  return workspace;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("WorkspaceFileService", () => {
  it("lists and reads text files inside the active workspace", async () => {
    const workspace = await createWorkspace();
    await mkdir(join(workspace, "src"));
    await writeFile(join(workspace, "README.md"), "# Workspace\n", "utf8");
    const files = new WorkspaceFileService(() => workspace);

    const root = await files.listDirectory("");
    expect(root.entries.map((entry) => [entry.name, entry.kind])).toEqual([
      ["src", "directory"],
      ["README.md", "file"],
    ]);
    await expect(files.readFile("README.md")).resolves.toMatchObject({
      path: "README.md",
      content: "# Workspace\n",
      truncated: false,
    });
  });

  it("rejects traversal and absolute renderer paths", async () => {
    const workspace = await createWorkspace();
    const files = new WorkspaceFileService(() => workspace);

    await expect(files.readFile("../outside.txt")).rejects.toThrow("工作区之外");
    await expect(files.readFile(join(workspace, "inside.txt"))).rejects.toThrow("相对路径");
  });

  it("rejects binary files", async () => {
    const workspace = await createWorkspace();
    await writeFile(join(workspace, "image.bin"), Buffer.from([1, 0, 2, 3]));
    const files = new WorkspaceFileService(() => workspace);

    await expect(files.readFile("image.bin")).rejects.toThrow("二进制文件");
  });

  it("searches workspace files for composer references and skips generated directories", async () => {
    const workspace = await createWorkspace();
    await mkdir(join(workspace, "src"));
    await mkdir(join(workspace, "node_modules"));
    await writeFile(join(workspace, "src", "Composer.tsx"), "export {}\n", "utf8");
    await writeFile(join(workspace, "node_modules", "Composer.js"), "", "utf8");
    const files = new WorkspaceFileService(() => workspace);

    await expect(files.searchFiles("composer")).resolves.toEqual([
      { name: "Composer.tsx", path: "src/Composer.tsx" },
    ]);
  });

  it("saves a text file only when its on-disk version still matches", async () => {
    const workspace = await createWorkspace();
    await writeFile(join(workspace, "note.txt"), "before\n", "utf8");
    const files = new WorkspaceFileService(() => workspace);
    const opened = await files.readFile("note.txt");

    await expect(files.saveFile({
      path: "note.txt",
      content: "after\n",
      expectedModifiedAt: opened.modifiedAt,
    })).resolves.toMatchObject({ content: "after\n" });

    await expect(files.saveFile({
      path: "note.txt",
      content: "later\n",
      expectedModifiedAt: opened.modifiedAt - 10_000,
    })).rejects.toThrow("磁盘上变更");
  });

  it("reverts an Agent file change only when no later edit conflicts", async () => {
    const workspace = await createWorkspace();
    await writeFile(join(workspace, "note.txt"), "agent output\n", "utf8");
    const files = new WorkspaceFileService(() => workspace);

    await files.revertAgentChange({
      path: "note.txt",
      changeType: "modified",
      beforeContent: "before\n",
      afterContent: "agent output\n",
      unifiedDiff: "",
      toolCallId: "tool-1",
      timestamp: Date.now(),
    });

    await expect(files.readFile("note.txt")).resolves.toMatchObject({ content: "before\n" });
  });
});

describe("FileChangeTracker", () => {
  it("captures a file changed by an arbitrary future tool at run settlement", async () => {
    const workspace = await createWorkspace();
    await writeFile(join(workspace, "note.txt"), "before\n", "utf8");
    const files = new WorkspaceFileService(() => workspace);
    const tracker = new FileChangeTracker(files);

    await tracker.beginRun();
    await writeFile(join(workspace, "note.txt"), "after\n", "utf8");
    await tracker.captureStart({ type: "agent_start" });
    await tracker.captureStart({
      type: "tool_execution_start",
      toolCallId: "future-1",
      toolName: "third-party-file-mutator",
      args: {},
    });
    await expect(tracker.captureEnd({
      type: "tool_execution_end",
      toolCallId: "future-1",
      toolName: "third-party-file-mutator",
      result: { content: [{ type: "text", text: "ok" }] },
      isError: false,
    })).resolves.toEqual([]);
    const [change] = await tracker.captureEnd({ type: "agent_settled" });

    expect(change).toMatchObject({
      path: "note.txt",
      changeType: "modified",
      beforeContent: "before\n",
      afterContent: "after\n",
    });
    expect(change.toolCallId).toBeUndefined();
    expect(change.unifiedDiff).toContain("-before");
    expect(change.unifiedDiff).toContain("+after");
  });

  it("captures every file created, modified, or deleted during one Agent run", async () => {
    const workspace = await createWorkspace();
    await writeFile(join(workspace, "modified.txt"), "before\n", "utf8");
    await writeFile(join(workspace, "deleted.txt"), "remove me\n", "utf8");
    const files = new WorkspaceFileService(() => workspace);
    const tracker = new FileChangeTracker(files);

    await tracker.captureStart({ type: "agent_start" });
    await writeFile(join(workspace, "modified.txt"), "after\n", "utf8");
    await writeFile(join(workspace, "created.txt"), "", "utf8");
    await unlink(join(workspace, "deleted.txt"));

    const changes = await tracker.captureEnd({ type: "agent_settled" });

    expect(changes.map((change) => [change.path, change.changeType])).toEqual([
      ["created.txt", "created"],
      ["deleted.txt", "deleted"],
      ["modified.txt", "modified"],
    ]);
    expect(changes.every((change) => change.toolCallId === undefined)).toBe(true);
  });

  it("emits no changes when a run leaves the workspace untouched", async () => {
    const workspace = await createWorkspace();
    const tracker = new FileChangeTracker(new WorkspaceFileService(() => workspace));

    await tracker.captureStart({ type: "agent_start" });
    await expect(tracker.captureEnd({ type: "agent_settled" })).resolves.toEqual([]);
  });
});

describe("createUnifiedDiff", () => {
  it("keeps nearby context around the changed block", () => {
    const diff = createUnifiedDiff("src/a.ts", "one\ntwo\nthree\n", "one\nchanged\nthree\n");
    expect(diff).toContain("--- a/src/a.ts");
    expect(diff).toContain("-two");
    expect(diff).toContain("+changed");
  });

  it("regenerates a diff with progressively wider context", () => {
    const before = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n");
    const after = before.replace("line 6", "line six");
    const compact = createUnifiedDiff("src/a.ts", before, after, 1);
    const expanded = createUnifiedDiff("src/a.ts", before, after, 5);

    expect(compact).not.toContain(" line 1");
    expect(compact).toContain(" line 5");
    expect(expanded).toContain(" line 1");
    expect(expanded).toContain(" line 11");
  });
});
