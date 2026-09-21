from typing import List


class Solution:
    def searchRange(self, nums: List[int], target: int) -> List[int]:
        start = end = -1
        for i, x in enumerate(nums):
            if x == target:
                if start == -1:
                    start = i
                end = i
        return [start, end]
