from typing import List
from collections import Counter


class Solution:
    def findAnagrams(self, s: str, p: str) -> List[int]:
        target = Counter(p)
        window = Counter()
        res = []
        for i, ch in enumerate(s):
            window[ch] += 1
            if i >= len(p):
                left_ch = s[i - len(p)]
                window[left_ch] -= 1
                if window[left_ch] == 0:
                    del window[left_ch]
            if window == target:
                res.append(i - len(p) + 1)
        return res
