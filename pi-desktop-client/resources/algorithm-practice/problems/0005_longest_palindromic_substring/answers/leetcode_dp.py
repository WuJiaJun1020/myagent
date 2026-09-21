class Solution:
    def longestPalindrome(self, s: str) -> str:
        n = len(s)
        if n < 2:
            return s
        dp = [[False] * n for _ in range(n)]
        start, max_len = 0, 1
        for i in range(n):
            dp[i][i] = True
        for j in range(1, n):
            for i in range(j):
                if s[i] == s[j] and (j - i < 3 or dp[i + 1][j - 1]):
                    dp[i][j] = True
                    if j - i + 1 > max_len:
                        max_len = j - i + 1
                        start = i
        return s[start:start + max_len]
