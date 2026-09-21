from typing import List


class Solution:
    def sortColors(self, nums: List[int]) -> None:
        c0 = c1 = c2 = 0
        for x in nums:
            if x == 0:
                c0 += 1
            elif x == 1:
                c1 += 1
            else:
                c2 += 1
        i = 0
        for _ in range(c0):
            nums[i] = 0
            i += 1
        for _ in range(c1):
            nums[i] = 1
            i += 1
        for _ in range(c2):
            nums[i] = 2
            i += 1
