import { describe, expect, it } from "vitest";
import { browserLinkTarget } from "../../../../../src/renderer/features/browser/browser-link";

describe("Markdown browser links", () => {
  it("decodes Chinese paths and spaces once", () => {
    expect(browserLinkTarget("/C:/Desktop/%E7%BD%91%E9%A1%B5%E5%B0%8F%E6%B8%B8%E6%88%8F/%E7%8C%9C%E6%95%B0%E5%AD%97%20v2.html")).toBe("/C:/Desktop/网页小游戏/猜数字 v2.html");
    expect(browserLinkTarget("./%25E7%258C%259C.html")).toBe("./%E7%8C%9C.html");
  });
  it("preserves URL encoding and literal or malformed paths", () => {
    for (const link of ["https://example.com/%E7%8C%9C.html?q=%26", "file:///C:/%E7%8C%9C.html", "./猜数字.html", "./100%.html"]) expect(browserLinkTarget(link)).toBe(link);
  });
});
