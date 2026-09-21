class Solution:
    def longestPalindrome(self, s: str) -> str:
        start, max_len = 0, 0
        for i in range(len(s)):
            for l, r in [(i, i), (i, i + 1)]:
                while l >= 0 and r < len(s) and s[l] == s[r]:
                    l -= 1
                    r += 1
                if r - l - 1 > max_len:
                    max_len = r - l - 1
                    start = l + 1
        return s[start:start + max_len]
