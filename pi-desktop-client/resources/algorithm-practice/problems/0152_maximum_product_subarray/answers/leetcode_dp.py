from typing import List


class Solution:
    def maxProduct(self, nums: List[int]) -> int:
        cur_max = cur_min = ans = nums[0]
        for x in nums[1:]:
            candidates = (cur_max * x, cur_min * x, x)
            cur_max = max(candidates)
            cur_min = min(candidates)
            ans = max(ans, cur_max)
        return ans
