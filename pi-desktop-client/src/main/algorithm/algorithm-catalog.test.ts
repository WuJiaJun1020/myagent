import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AlgorithmCatalog } from "./algorithm-catalog";

const resourceDirectory = join(process.cwd(), "resources", "algorithm-practice");

describe("AlgorithmCatalog", () => {
  it("loads the complete Hot 100 catalog without exposing hidden tests", () => {
    const catalog = new AlgorithmCatalog(resourceDirectory);
    expect(catalog.problems).toHaveLength(100);
    expect(catalog.categories.reduce((sum, category) => sum + category.count, 0)).toBe(100);
    const problem = catalog.getProblem("two_sum");
    expect(problem).toMatchObject({ id: 1, title: "两数之和", difficulty: "easy" });
    expect(problem.templates.leetcode).toContain("class Solution");
    expect(problem.answers.length).toBeGreaterThan(0);
    expect(problem).not.toHaveProperty("test_cases");
  });

  it("converts packaged problem images into renderer-safe data URLs", () => {
    const catalog = new AlgorithmCatalog(resourceDirectory);
    const problem = catalog.getProblem("rotate_image");
    const image = problem.examples.find((example) => example.imageFile)?.imageDataUrl;
    expect(image).toMatch(/^data:image\/(?:jpeg|png|gif|webp);base64,/);
  });

  it("only resolves an answer inside the requested problem and mode", () => {
    const catalog = new AlgorithmCatalog(resourceDirectory);
    expect(catalog.getAnswer("two_sum", "leetcode", "leetcode_hash.py")?.code).toContain("class Solution");
    expect(catalog.getAnswer("two_sum", "acm", "leetcode_hash.py")).toBeUndefined();
    expect(catalog.getAnswer("two_sum", "leetcode", "../problem.py")).toBeUndefined();
  });
});
