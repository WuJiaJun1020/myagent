import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FileChange } from "../../shared/contracts/workspace";
import { TurnFileChangeStore } from "./turn-file-change-store";

const temporaryDirectories: string[] = [];

async function createStore(): Promise<{ directory: string; store: TurnFileChangeStore }> {
  const directory = await mkdtemp(join(tmpdir(), "pi-turn-changes-"));
  temporaryDirectories.push(directory);
  return { directory, store: new TurnFileChangeStore(directory) };
}

function change(path: string, timestamp: number): FileChange {
  return {
    path,
    changeType: "modified",
    beforeContent: "before\n",
    afterContent: "after\n",
    unifiedDiff: "@@ -1 +1 @@\n-before\n+after",
    timestamp,
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("TurnFileChangeStore", () => {
  it("restores turn changes through a new store instance", async () => {
    const { directory, store } = await createStore();
    const changes = [change("src/app.ts", 10)];
    await store.save("session-a", 2, changes);

    const restartedStore = new TurnFileChangeStore(directory);
    await expect(restartedStore.load("session-a")).resolves.toEqual([{ turnIndex: 2, changes }]);
  });

  it("updates one turn without dropping the other stored turns", async () => {
    const { store } = await createStore();
    await store.save("session-a", 0, [change("src/first.ts", 1)]);
    await Promise.all([
      store.save("session-a", 1, [change("src/second.ts", 2)]),
      store.save("session-a", 0, [change("src/first-updated.ts", 3)]),
    ]);

    await expect(store.load("session-a")).resolves.toEqual([
      { turnIndex: 0, changes: [change("src/first-updated.ts", 3)] },
      { turnIndex: 1, changes: [change("src/second.ts", 2)] },
    ]);
  });

  it("removes persisted metadata with its session", async () => {
    const { store } = await createStore();
    await store.save("session-a", 0, [change("src/app.ts", 1)]);
    await store.remove("session-a");

    await expect(store.load("session-a")).resolves.toEqual([]);
  });
});
