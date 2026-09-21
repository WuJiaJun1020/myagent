from typing import List


class Solution:
    def subsets(self, nums: List[int]) -> List[List[int]]:
        res = []
        n = len(nums)
        for mask in range(1 << n):
            res.append([nums[i] for i in range(n) if mask >> i & 1])
        return res
