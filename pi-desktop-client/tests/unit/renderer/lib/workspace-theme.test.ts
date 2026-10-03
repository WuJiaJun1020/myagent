import { describe, expect, it } from "vitest";
import { accentOptions, getThemeTokens, paletteOptions, workspaceThemeCss } from "../../../../src/renderer/lib/workspace-theme";
import { getTerminalTheme } from "../../../../src/renderer/lib/terminal-theme";
function luminance(hex: string): number {
  const channels = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}
describe("workspace theme accessibility and adapters", () => {
  for (const { value: palette } of paletteOptions) for (const mode of ["light", "dark"] as const) for (const { value: accent } of accentOptions) {
    it(`${palette}/${mode}/${accent} keeps readable text and shared terminal surfaces`, () => {
      const tokens = getThemeTokens(palette, mode, accent);
      for (const foreground of ["text", "text-soft", "text-muted", "accent"] as const) {
        expect(contrast(tokens[foreground], tokens["bg-app"]), foreground).toBeGreaterThanOrEqual(4.5);
      }
      for (const surface of ["bg-sidebar", "bg-panel", "bg-elevated"] as const) {
        expect(contrast(tokens["text-muted"], tokens[surface]), `muted on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(tokens["accent-ink"], tokens.accent)).toBeGreaterThanOrEqual(4.5);
      expect(new Set([tokens["bg-sidebar"], tokens["bg-hover"], tokens["bg-selected"]]).size).toBe(3);
      expect(workspaceThemeCss()).toContain(`html[data-workspace="interview"][data-palette="${palette}"][data-theme="${mode}"][data-accent="${accent}"]`);
      expect(workspaceThemeCss()).toContain(`html[data-workspace="knowledge-studio"][data-palette="${palette}"][data-theme="${mode}"][data-accent="${accent}"]`);
      const terminal = getTerminalTheme(palette, mode, accent);
      expect(terminal.background).toBe(tokens["bg-app"]);
      expect(terminal.foreground).toBe(tokens.text);
      expect(terminal.selectionBackground).toBe(tokens["bg-selected"]);
      expect(workspaceThemeCss()).toContain(`html[data-workspace="agent"][data-palette="${palette}"][data-theme="${mode}"][data-accent="${accent}"]`);
    });
  }
});
