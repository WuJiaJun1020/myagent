from typing import List


class Solution:
    def searchInsert(self, nums: List[int], target: int) -> int:
        for i, x in enumerate(nums):
            if x >= target:
                return i
        return len(nums)
