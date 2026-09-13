import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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
  it("creates a file change linked to the originating write tool", async () => {
    const workspace = await createWorkspace();
    await writeFile(join(workspace, "note.txt"), "before\n", "utf8");
    const files = new WorkspaceFileService(() => workspace);
    const tracker = new FileChangeTracker(files);

    await tracker.captureStart({
      type: "tool_execution_start",
      toolCallId: "write-1",
      toolName: "write",
      args: { path: "note.txt", content: "after\n" },
    });
    await writeFile(join(workspace, "note.txt"), "after\n", "utf8");
    const change = await tracker.captureEnd({
      type: "tool_execution_end",
      toolCallId: "write-1",
      toolName: "write",
      result: { content: [{ type: "text", text: "ok" }] },
      isError: false,
    });

    expect(change).toMatchObject({
      path: "note.txt",
      changeType: "modified",
      beforeContent: "before\n",
      afterContent: "after\n",
      toolCallId: "write-1",
    });
    expect(change?.unifiedDiff).toContain("-before");
    expect(change?.unifiedDiff).toContain("+after");
  });
});

describe("createUnifiedDiff", () => {
  it("keeps nearby context around the changed block", () => {
    const diff = createUnifiedDiff("src/a.ts", "one\ntwo\nthree\n", "one\nchanged\nthree\n");
    expect(diff).toContain("--- a/src/a.ts");
    expect(diff).toContain("-two");
    expect(diff).toContain("+changed");
  });
});
