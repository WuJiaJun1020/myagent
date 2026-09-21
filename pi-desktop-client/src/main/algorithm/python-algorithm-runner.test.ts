import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PythonAlgorithmRunner } from "./python-algorithm-runner";

const resourceDirectory = join(process.cwd(), "resources", "algorithm-practice");
const embeddedPython = join(process.cwd(), "resources", "python", process.platform === "win32" ? "python.exe" : "bin/python3");

describe("PythonAlgorithmRunner", () => {
  it("reports an unavailable runtime without trying to execute code", async () => {
    const runner = new PythonAlgorithmRunner({ resourceDirectory, runtimeCandidates: [] });
    expect(await runner.getRuntimeInfo()).toMatchObject({ available: false, source: "missing" });
    expect(await runner.run({ slug: "two_sum", mode: "leetcode", code: "pass" })).toMatchObject({
      verdict: "runtime_unavailable",
      total: 0,
    });
    await runner.close();
  });

  it.skipIf(!existsSync(embeddedPython))("executes accepted LeetCode code through the one-shot bridge", async () => {
    const runner = new PythonAlgorithmRunner({
      resourceDirectory,
      runtimeCandidates: [{
        command: embeddedPython,
        prefixArguments: [],
        source: "embedded",
        displayName: "内置 Python",
      }],
    });
    const code = [
      "class Solution:",
      "    def twoSum(self, nums, target):",
      "        seen = {}",
      "        for i, value in enumerate(nums):",
      "            if target - value in seen:",
      "                return [seen[target - value], i]",
      "            seen[value] = i",
    ].join("\n");
    const result = await runner.run({ slug: "two_sum", mode: "leetcode", code });
    expect(result).toMatchObject({ verdict: "accepted", passed: 6, total: 6 });
    await runner.close();
  });

  it.skipIf(!existsSync(embeddedPython))("accepts a valid Unicode-heavy request within the service character limit", async () => {
    const runner = new PythonAlgorithmRunner({
      resourceDirectory,
      runtimeCandidates: [{
        command: embeddedPython,
        prefixArguments: [],
        source: "embedded",
        displayName: "内置 Python",
      }],
    });
    const code = [
      `# ${"注".repeat(180_000)}`,
      "class Solution:",
      "    def twoSum(self, nums, target):",
      "        seen = {}",
      "        for i, value in enumerate(nums):",
      "            if target - value in seen:",
      "                return [seen[target - value], i]",
      "            seen[value] = i",
    ].join("\n");
    expect(code.length).toBeLessThan(200_000);
    const result = await runner.run({ slug: "two_sum", mode: "leetcode", code });
    expect(result).toMatchObject({ verdict: "accepted", passed: 6, total: 6 });
    await runner.close();
  });

  it.skipIf(!existsSync(embeddedPython))("rejects the old permutations false-positive", async () => {
    const runner = new PythonAlgorithmRunner({
      resourceDirectory,
      runtimeCandidates: [{
        command: embeddedPython,
        prefixArguments: [],
        source: "embedded",
        displayName: "内置 Python",
      }],
    });
    const code = [
      "import math",
      "class Solution:",
      "    def permute(self, nums):",
      "        return [sorted(nums) for _ in range(math.factorial(len(nums)))]",
    ].join("\n");
    const result = await runner.run({ slug: "permutations", mode: "leetcode", code });
    expect(result.verdict).toBe("wrong_answer");
    expect(result.passed).toBeLessThan(result.total);
    await runner.close();
  });

  it.skipIf(!existsSync(embeddedPython))("rejects forged substrings, nodes, shallow copies and cyclic lists", async () => {
    const runner = new PythonAlgorithmRunner({
      resourceDirectory,
      runtimeCandidates: [{
        command: embeddedPython,
        prefixArguments: [],
        source: "embedded",
        displayName: "内置 Python",
      }],
    });
    const palindrome = await runner.run({
      slug: "longest_palindromic_substring",
      mode: "leetcode",
      code: [
        "class Solution:",
        "    def longestPalindrome(self, s):",
        "        return {'babad': 'aaa', 'cbbd': 'aa', 'a': 'a', 'ac': 'a'}[s]",
      ].join("\n"),
    });
    const shallowCopy = await runner.run({
      slug: "copy_list_with_random_pointer",
      mode: "leetcode",
      code: "class Solution:\n    def copyRandomList(self, head):\n        return head\n",
    });
    const forgedLca = await runner.run({
      slug: "lowest_common_ancestor_of_a_binary_tree",
      mode: "leetcode",
      code: [
        "from core.types import TreeNode",
        "class Solution:",
        "    def lowestCommonAncestor(self, root, p, q):",
        "        def find(node):",
        "            if node is None or node is p or node is q: return node",
        "            left, right = find(node.left), find(node.right)",
        "            return node if left and right else left or right",
        "        found = find(root)",
        "        return TreeNode(found.val)",
      ].join("\n"),
    });
    const cyclicList = await runner.run({
      slug: "reverse_linked_list",
      mode: "leetcode",
      code: [
        "from core.types import ListNode",
        "class Solution:",
        "    def reverseList(self, head):",
        "        values = []",
        "        while head:",
        "            values.append(head.val); head = head.next",
        "        result = ListNode.from_list(list(reversed(values)))",
        "        if result:",
        "            tail = result",
        "            while tail.next: tail = tail.next",
        "            tail.next = result",
        "        return result",
      ].join("\n"),
    });

    for (const result of [palindrome, shallowCopy, forgedLca, cyclicList]) {
      expect(result.verdict).toBe("wrong_answer");
      expect(result.passed).toBeLessThan(result.total);
    }
    await runner.close();
  });

  it.skipIf(!existsSync(embeddedPython))("terminates non-ending submissions at the outer process boundary", async () => {
    const runner = new PythonAlgorithmRunner({
      resourceDirectory,
      timeoutMs: 800,
      runtimeCandidates: [{
        command: embeddedPython,
        prefixArguments: [],
        source: "embedded",
        displayName: "内置 Python",
      }],
    });
    const result = await runner.run({
      slug: "two_sum",
      mode: "leetcode",
      code: "class Solution:\n    def twoSum(self, nums, target):\n        while True: pass\n",
    });
    expect(result).toMatchObject({ verdict: "time_limit_exceeded", passed: 0 });
    await runner.close();
  });

  it.skipIf(!existsSync(embeddedPython))("stops submissions that exceed the bridge output budget", async () => {
    const runner = new PythonAlgorithmRunner({
      resourceDirectory,
      runtimeCandidates: [{
        command: embeddedPython,
        prefixArguments: [],
        source: "embedded",
        displayName: "内置 Python",
      }],
    });
    const result = await runner.run({
      slug: "two_sum",
      mode: "leetcode",
      code: [
        "class Solution:",
        "    def twoSum(self, nums, target):",
        "        print('x' * 300000)",
        "        return [0, 1]",
      ].join("\n"),
    });
    expect(result).toMatchObject({ verdict: "output_limit_exceeded", passed: 0 });
    await runner.close();
  });
});
