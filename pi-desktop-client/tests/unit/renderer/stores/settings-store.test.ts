import { afterEach, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
async function load(saved: Record<string, unknown>) {
  const values = new Map([["pi-desktop-settings", JSON.stringify({ state: saved, version: 0 })]]);
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  const { useSettingsStore } = await import("../../../../src/renderer/stores/settings-store");
  return { store: useSettingsStore, values };
}
it("adds theme defaults without replacing existing typography, mode or model preferences", async () => {
  const { store } = await load({ theme: "light", uiFontSize: 16, codeFontFamily: "consolas", animationEnabled: false, preferredModel: { provider: "test", id: "existing" } });
  expect(store.getState()).toMatchObject({ theme: "light", palette: "gray", accent: "theme", uiFontSize: 16, animationEnabled: false, preferredModel: { id: "existing" } });
});
it("saves independent palette and accent selections and restores them after rehydration", async () => {
  const { store, values } = await load({ theme: "system", contentFontSize: 18 });
  store.getState().setPalette("sand"); store.getState().setAccent("green");
  expect(JSON.parse(values.get("pi-desktop-settings")!).state).toMatchObject({ theme: "system", palette: "sand", accent: "green", contentFontSize: 18 });
  vi.resetModules();
  const restored = (await import("../../../../src/renderer/stores/settings-store")).useSettingsStore.getState();
  expect(restored).toMatchObject({ theme: "system", palette: "sand", accent: "green", contentFontSize: 18 });
});
it("falls back only for invalid new theme fields", async () => {
  const { store } = await load({ palette: "missing", accent: "invalid", theme: "dark", sidebarWidth: 290 });
  expect(store.getState()).toMatchObject({ palette: "gray", accent: "theme", theme: "dark", sidebarWidth: 290 });
});
