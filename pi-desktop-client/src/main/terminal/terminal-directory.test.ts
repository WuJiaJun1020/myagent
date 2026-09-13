import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveTerminalDirectory } from "./terminal-directory";

const temporaryDirectories: string[] = [];

async function createDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pi-desktop-terminal-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("resolveTerminalDirectory", () => {
  it("resolves a relative directory from the terminal working directory", async () => {
    const root = await createDirectory();
    await mkdir(join(root, "nested"));

    await expect(resolveTerminalDirectory(root, "nested")).resolves.toMatch(/nested$/);
  });

  it("rejects file paths", async () => {
    const root = await createDirectory();
    await writeFile(join(root, "note.txt"), "text", "utf8");

    await expect(resolveTerminalDirectory(root, "note.txt")).rejects.toThrow("不是目录");
  });
});
