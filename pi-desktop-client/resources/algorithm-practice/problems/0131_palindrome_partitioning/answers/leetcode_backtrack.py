from typing import List


class Solution:
    def partition(self, s: str) -> List[List[str]]:
        res = []

        def is_pal(x):
            return x == x[::-1]

        def backtrack(start, path):
            if start == len(s):
                res.append(path[:])
                return
            for end in range(start + 1, len(s) + 1):
                sub = s[start:end]
                if is_pal(sub):
                    path.append(sub)
                    backtrack(end, path)
                    path.pop()

        backtrack(0, [])
        return res
