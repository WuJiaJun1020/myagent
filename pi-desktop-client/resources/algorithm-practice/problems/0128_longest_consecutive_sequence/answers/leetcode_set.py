from typing import List


class Solution:
    def longestConsecutive(self, nums: List[int]) -> int:
        s = set(nums)
        ans = 0
        for x in s:
            if x - 1 not in s:
                cur = 1
                while x + 1 in s:
                    x += 1
                    cur += 1
                ans = max(ans, cur)
        return ans
