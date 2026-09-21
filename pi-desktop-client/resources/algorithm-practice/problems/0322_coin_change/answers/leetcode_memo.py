from typing import List


class Solution:
    def coinChange(self, coins: List[int], amount: int) -> int:
        memo = {}

        def dfs(remain):
            if remain == 0:
                return 0
            if remain < 0:
                return -1
            if remain in memo:
                return memo[remain]
            best = float("inf")
            for c in coins:
                r = dfs(remain - c)
                if r >= 0:
                    best = min(best, r + 1)
            memo[remain] = best if best != float("inf") else -1
            return memo[remain]

        return dfs(amount)
