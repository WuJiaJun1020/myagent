import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getDefaultPiSessionDir, listPiSessions } from "./pi-session-index";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pi-desktop-sessions-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("listPiSessions", () => {
  it("indexes valid Pi JSONL sessions, uses the latest name, and sorts by activity", async () => {
    const directory = await createTemporaryDirectory();
    const cwd = join(directory, "workspace");
    const older = [
      { type: "session", version: 3, id: "older", timestamp: "2026-01-01T00:00:00.000Z", cwd },
      { type: "message", id: "m1", parentId: null, timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: [{ type: "text", text: "  修复   登录问题  " }], timestamp: 1_767_225_601_000 } },
      { type: "session_info", id: "n1", parentId: "m1", timestamp: "2026-01-01T00:00:02.000Z", name: "旧名称" },
      { type: "session_info", id: "n2", parentId: "n1", timestamp: "2026-01-01T00:00:03.000Z", name: "登录修复" },
    ];
    const newer = [
      { type: "session", version: 3, id: "newer", timestamp: "2026-01-02T00:00:00.000Z", cwd },
      { type: "message", id: "m2", parentId: null, timestamp: "2026-01-02T00:00:01.000Z", message: { role: "assistant", content: "先分析" } },
      { type: "message", id: "m3", parentId: "m2", timestamp: "2026-01-02T00:00:02.000Z", message: { role: "user", content: "实现设置页面" } },
      { type: "custom", id: "mode1", parentId: "m3", timestamp: "2026-01-02T00:00:03.000Z", customType: "pi.rpc.session-mode", data: { mode: "chat", workToolNames: ["read"] } },
    ];

    await writeFile(join(directory, "older.jsonl"), `${older.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
    await writeFile(join(directory, "newer.jsonl"), `${newer.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
    await writeFile(join(directory, "broken.jsonl"), "not-json\n", "utf8");

    const sessions = await listPiSessions(cwd, { sessionDir: directory });

    expect(sessions.map((session) => session.id)).toEqual(["newer", "older"]);
    expect(sessions[0]).toMatchObject({ firstMessage: "实现设置页面", messageCount: 2, mode: "chat" });
    expect(sessions[1]).toMatchObject({ name: "登录修复", firstMessage: "修复 登录问题", messageCount: 1, mode: "work" });
  });

  it("filters another workspace when a shared custom session directory is used", async () => {
    const directory = await createTemporaryDirectory();
    const cwd = join(directory, "workspace-a");
    const otherCwd = join(directory, "workspace-b");
    const records = [
      { file: "a.jsonl", header: { type: "session", id: "a", timestamp: "2026-01-01T00:00:00.000Z", cwd } },
      { file: "b.jsonl", header: { type: "session", id: "b", timestamp: "2026-01-01T00:00:00.000Z", cwd: otherCwd } },
    ];
    await Promise.all(records.map(({ file, header }) => writeFile(join(directory, file), `${JSON.stringify(header)}\n`, "utf8")));

    const sessions = await listPiSessions(cwd, { sessionDir: directory });

    expect(sessions.map((session) => session.id)).toEqual(["a"]);
  });

  it("encodes the workspace path exactly like Pi's default session directory", () => {
    expect(getDefaultPiSessionDir("D:\\Code\\demo", "D:\\AgentData")).toBe(
      join("D:\\AgentData", "sessions", "--D--Code-demo--"),
    );
  });
});
