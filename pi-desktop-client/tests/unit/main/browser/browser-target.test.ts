import { describe, expect, it } from "vitest";
import { browserTarget } from "../../../../src/main/browser/browser-target";

describe("browser targets", () => {
  it("accepts web addresses and localhost", () => {
    expect(browserTarget("localhost:5173/game", "D:/work")).toEqual({ kind: "web", value: "http://localhost:5173/game" });
    expect(browserTarget("https://example.com/a?q=1", "D:/work").kind).toBe("web");
    expect(browserTarget("example.com", "D:/work").value).toBe("https://example.com/");
  });
  it("resolves local HTML including encoded Chinese filenames", () => {
    expect(browserTarget("file:///D:/games/%E7%8C%9C%E6%95%B0%E5%AD%97.html", "D:/work").value.replaceAll("\\", "/")).toBe("D:/games/猜数字.html");
    expect(browserTarget("./game.html", "D:/work").value.replaceAll("\\", "/")).toBe("D:/work/game.html");
    expect(browserTarget("/D:/games/index.html", "D:/work").kind).toBe("file");
  });
  it.each(["javascript:alert(1)", "data:text/html,hi", "ftp://example.com", "https://user:pass@example.com", "C:/secret.txt", "javascript:foo.html"])("rejects unsupported target %s", input => {
    expect(() => browserTarget(input, "D:/work")).toThrow();
  });
});
