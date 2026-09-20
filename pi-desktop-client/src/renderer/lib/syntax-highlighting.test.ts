import { describe, expect, it } from "vitest";
import { highlightCode, languageForPath } from "./syntax-highlighting";

describe("syntax highlighting", () => {
  it("detects common languages from nested and Windows-style paths", () => {
    expect(languageForPath("src/components/App.tsx")).toBe("tsx");
    expect(languageForPath("scripts\\build.ps1")).toBe("powershell");
    expect(languageForPath("Dockerfile")).toBe("bash");
    expect(languageForPath("notes.unknown")).toBeUndefined();
  });

  it("produces escaped token markup for supported source files", () => {
    const highlighted = highlightCode('const value = "<safe>";', "src/example.ts");
    expect(highlighted).toContain('class="token keyword"');
    expect(highlighted).toContain("&lt;safe>");
    expect(highlighted).not.toContain("<safe>");
  });
});
