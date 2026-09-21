from typing import List


class Solution:
    def findAnagrams(self, s: str, p: str) -> List[int]:
        target = sorted(p)
        res = []
        for i in range(len(s) - len(p) + 1):
            if sorted(s[i:i + len(p)]) == target:
                res.append(i)
        return res
