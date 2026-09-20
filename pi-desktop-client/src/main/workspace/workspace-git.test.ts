import { execFile } from "node:child_process";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { WorkspaceFileService } from "./workspace-files";
import { parseGitNumstat, parseGitStatus, toGitPath, toWorkspacePath, WorkspaceGitService } from "./workspace-git";

const run = promisify(execFile);

describe("workspace git parsing", () => {
  it("parses branch synchronization and porcelain file states", () => {
    const status = parseGitStatus(
      "## main...origin/main [ahead 2, behind 1]\0 M src/app.ts\0?? src/new.ts\0R  src/renamed.ts\0src/old.ts\0",
    );

    expect(status.branch).toBe("main");
    expect(status.ahead).toBe(2);
    expect(status.behind).toBe(1);
    expect(status.files).toEqual([
      {
        path: "src/app.ts",
        indexStatus: " ",
        workTreeStatus: "M",
        additions: 0,
        deletions: 0,
        binary: false,
      },
      {
        path: "src/new.ts",
        indexStatus: "?",
        workTreeStatus: "?",
        additions: 0,
        deletions: 0,
        binary: false,
      },
      {
        path: "src/renamed.ts",
        renamedFrom: "src/old.ts",
        indexStatus: "R",
        workTreeStatus: " ",
        additions: 0,
        deletions: 0,
        binary: false,
      },
    ]);
  });

  it("parses text, binary, and renamed numstat entries", () => {
    const stats = parseGitNumstat([
      "3\t1\tsrc/app.ts",
      "-\t-\tassets/logo.png",
      "2\t4\t",
      "src/old.ts",
      "src/new.ts",
      "",
    ].join("\0"));

    expect(stats.get("src/app.ts")).toEqual({ additions: 3, deletions: 1, binary: false });
    expect(stats.get("assets/logo.png")).toEqual({ additions: 0, deletions: 0, binary: true });
    expect(stats.get("src/new.ts")).toEqual({ additions: 2, deletions: 4, binary: false });
  });

  it("maps paths between a nested workspace and its repository root", () => {
    expect(toGitPath("packages/client", "src/app.ts")).toBe("packages/client/src/app.ts");
    expect(toWorkspacePath("packages/client", "packages/client/src/app.ts")).toBe("src/app.ts");
    expect(toWorkspacePath("packages/client", "packages/server/src/app.ts")).toBeNull();
  });

  it("reports and renders a deleted tracked file", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-desktop-git-delete-"));
    const path = join(root, "deleted.txt");
    try {
      await run("git", ["init"], { cwd: root });
      await writeFile(path, "first\nsecond\n", "utf8");
      await run("git", ["add", "deleted.txt"], { cwd: root });
      await run("git", ["-c", "user.name=Pi Test", "-c", "user.email=pi@example.invalid", "commit", "-m", "initial"], { cwd: root });
      await unlink(path);

      const files = new WorkspaceFileService(() => root);
      const git = new WorkspaceGitService(() => root, files);
      const status = await git.getStatus();
      const deleted = status.files.find((file) => file.path === "deleted.txt");
      const diff = await git.getDiff("deleted.txt", "unstaged");

      expect(deleted).toMatchObject({ workTreeStatus: "D", additions: 0, deletions: 2 });
      expect(diff.diff).toContain("deleted file mode");
      expect(diff.diff).toContain("-first");
      expect(diff.diff).toContain("-second");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps staged, unstaged, and combined review scopes distinct", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-desktop-git-scopes-"));
    const path = join(root, "scoped.txt");
    try {
      await run("git", ["init"], { cwd: root });
      await writeFile(path, "base\n", "utf8");
      await run("git", ["add", "scoped.txt"], { cwd: root });
      await run("git", ["-c", "user.name=Pi Test", "-c", "user.email=pi@example.invalid", "commit", "-m", "initial"], { cwd: root });
      await writeFile(path, "staged\n", "utf8");
      await run("git", ["add", "scoped.txt"], { cwd: root });
      await writeFile(path, "working tree\n", "utf8");

      const files = new WorkspaceFileService(() => root);
      const git = new WorkspaceGitService(() => root, files);
      const status = await git.getStatus();
      const changed = status.files.find((file) => file.path === "scoped.txt");
      const staged = await git.getDiff("scoped.txt", "staged");
      const unstaged = await git.getDiff("scoped.txt", "unstaged");
      const uncommitted = await git.getDiff("scoped.txt", "uncommitted");

      expect(changed).toMatchObject({
        stagedAdditions: 1,
        stagedDeletions: 1,
        unstagedAdditions: 1,
        unstagedDeletions: 1,
      });
      expect(staged.diff).toContain("+staged");
      expect(unstaged.diff).toContain("+working tree");
      expect(uncommitted.diff).toContain("-base");
      expect(uncommitted.diff).toContain("+working tree");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requests wider unchanged context without changing the reviewed scope", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-desktop-git-context-"));
    const path = join(root, "context.txt");
    try {
      await run("git", ["init"], { cwd: root });
      const before = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n");
      await writeFile(path, `${before}\n`, "utf8");
      await run("git", ["add", "context.txt"], { cwd: root });
      await run("git", ["-c", "user.name=Pi Test", "-c", "user.email=pi@example.invalid", "commit", "-m", "initial"], { cwd: root });
      await writeFile(path, `${before.replace("line 6", "line six")}\n`, "utf8");

      const files = new WorkspaceFileService(() => root);
      const git = new WorkspaceGitService(() => root, files);
      const compact = await git.getDiff("context.txt", "unstaged", 0);
      const expanded = await git.getDiff("context.txt", "unstaged", 5);

      expect(compact.diff).not.toContain("\n line 5\n");
      expect(expanded.diff).toContain("\n line 1\n");
      expect(expanded.diff).toContain("\n line 11\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
