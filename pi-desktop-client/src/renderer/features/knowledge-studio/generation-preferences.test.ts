import { afterEach, describe, expect, it, vi } from "vitest";
import { readSavedGenerationModel, readSavedGenerationSources, readSavedGenerationThinkingLevel, reconcileGenerationSources, saveGenerationModel, saveGenerationSources, saveGenerationThinkingLevel } from "./generation-preferences";

afterEach(() => vi.unstubAllGlobals());

describe("generation source preferences", () => {
  it("defaults to available sources only when no preference has been saved", () => {
    expect(reconcileGenerationSources(null, ["a", "b"])).toEqual(["a", "b"]);
    expect(reconcileGenerationSources([], ["a", "b"])).toEqual([]);
  });

  it("drops deleted IDs, duplicates, and sources beyond the task limit", () => {
    const available = Array.from({ length: 22 }, (_, index) => `source-${index}`);
    expect(reconcileGenerationSources(["deleted", "source-1", "source-1", ...available], available))
      .toEqual(["source-1", ...available.filter((id) => id !== "source-1").slice(0, 19)]);
  });

  it("saves and restores even an explicitly empty selection", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    } });
    expect(readSavedGenerationSources()).toBeNull();
    saveGenerationSources([]);
    expect(readSavedGenerationSources()).toEqual([]);
    saveGenerationSources(["source-2"]);
    expect(readSavedGenerationSources()).toEqual(["source-2"]);
  });
});

describe("generation model preference", () => {
  it("remembers an explicit model and clears it when following the default", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } });
    expect(readSavedGenerationModel()).toBeNull();
    saveGenerationModel({ providerId: "deepseek", modelId: "deepseek-flash" });
    expect(readSavedGenerationModel()).toEqual({ providerId: "deepseek", modelId: "deepseek-flash" });
    saveGenerationModel(undefined);
    expect(readSavedGenerationModel()).toBeNull();
  });

  it("restores thinking depth after leaving the form and clears it on reset", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } });
    expect(readSavedGenerationThinkingLevel()).toBeNull();
    saveGenerationThinkingLevel("high");
    expect(readSavedGenerationThinkingLevel()).toBe("high");
    saveGenerationThinkingLevel("default");
    expect(readSavedGenerationThinkingLevel()).toBeNull();
  });
});
