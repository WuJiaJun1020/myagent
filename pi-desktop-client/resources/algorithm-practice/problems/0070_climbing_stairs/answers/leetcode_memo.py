class Solution:
    def climbStairs(self, n: int) -> int:
        memo = {}

        def f(x):
            if x <= 2:
                return x
            if x not in memo:
                memo[x] = f(x - 1) + f(x - 2)
            return memo[x]

        return f(n)
