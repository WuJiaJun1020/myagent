import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { DESKTOP_COMMANDS, filterCommands } from "../../../../../src/renderer/features/chat/slash-commands";
describe("desktop slash command coverage", () => {
    it("covers every native Pi builtin without truncating loaded commands", () => {
        const source = readFileSync("../pi-agent/packages/coding-agent/src/core/slash-commands.ts", "utf8");
        const names = [...source.matchAll(/name: "([a-z-]+)"/g)].map(m => m[1]);
        for (const name of names)
            expect(DESKTOP_COMMANDS.some(c => c.name === name), name).toBe(true);
        const extensions = Array.from({ length: 20 }, (_, i) => ({ name: "ext-" + i, description: "Extension", source: "extension" as const }));
        const all = filterCommands(extensions, "");
        expect(all).toHaveLength(extensions.length + DESKTOP_COMMANDS.length);
        expect(all.some(c => c.name === "compact")).toBe(true);
        expect(filterCommands(extensions, "COMPACT").map(c => c.name)).toEqual(["compact"]);
        expect(filterCommands(extensions, null)).toEqual([]);
    });
    it("deduplicates collisions in favor of the desktop handler", () => {
        const result = filterCommands([{ name: "compact", source: "extension", description: "collision" }], "compact");
        expect(result).toHaveLength(1);
        expect(result[0].source).toBe("desktop");
    });
});
