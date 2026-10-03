import { describe, it, expect } from "vitest";
import { parseGistUrl } from "../../../../src/main/agent/session-share";
describe("Gist result validation", () => {
    it("accepts only GitHub Gist URLs", () => {
        expect(parseGistUrl("https://gist.github.com/example/a1b2c3\n")).toBe("https://gist.github.com/example/a1b2c3");
        for (const value of ["javascript:alert(1)", "https://gist.github.com.evil.test/user/abc", "https://github.com/user/abc", "", "https://gist.github.com/user/abc extra"])
            expect(() => parseGistUrl(value)).toThrow();
    });
});
