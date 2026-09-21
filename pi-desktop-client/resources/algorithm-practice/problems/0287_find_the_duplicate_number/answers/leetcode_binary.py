from typing import List


class Solution:
    def findDuplicate(self, nums: List[int]) -> int:
        l, r = 1, len(nums) - 1
        while l < r:
            mid = (l + r) // 2
            count = sum(1 for x in nums if x <= mid)
            if count > mid:
                r = mid
            else:
                l = mid + 1
        return l
