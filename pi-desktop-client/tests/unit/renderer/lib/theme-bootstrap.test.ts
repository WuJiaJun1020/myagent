import { afterEach, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it.each([true, false])("restores system mode before mount (system dark=%s)", async dark => {
  const root = { dataset: {}, style: {} };
  const appendChild = vi.fn();
  vi.stubGlobal("document", { documentElement: root, createElement: () => ({}), getElementById: () => null, head: { appendChild } });
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ state: { theme: "system", palette: "sand", accent: "green", animationEnabled: false } }) });
  vi.stubGlobal("sessionStorage", { getItem: () => JSON.stringify({ activeModule: "agent" }) });
  vi.stubGlobal("matchMedia", () => ({ matches: dark }));
  await import("../../../../src/renderer/lib/theme-bootstrap");
  expect(root.dataset).toEqual({ workspace: "agent", theme: dark ? "dark" : "light", palette: "sand", accent: "green", motion: "reduced" });
  expect(root.style).toEqual({ colorScheme: dark ? "dark" : "light" });
  expect(appendChild).toHaveBeenCalledOnce();
});
it("preserves the restored interview workspace during fallback", async () => {
  const root = { dataset: {}, style: {} };
  vi.stubGlobal("document", { documentElement: root, createElement: () => ({}), getElementById: () => null, head: { appendChild: vi.fn() } });
  vi.stubGlobal("localStorage", { getItem: () => "invalid json" });
  vi.stubGlobal("sessionStorage", { getItem: () => JSON.stringify({ activeModule: "interview" }) });
  await import("../../../../src/renderer/lib/theme-bootstrap");
  expect(root.dataset).toMatchObject({ workspace: "interview", theme: "light", palette: "gray", accent: "theme" });
});
