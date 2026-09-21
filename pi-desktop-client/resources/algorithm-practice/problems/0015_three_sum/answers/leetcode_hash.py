from typing import List


class Solution:
    def threeSum(self, nums: List[int]) -> List[List[int]]:
        nums.sort()
        res = set()
        n = len(nums)
        for i in range(n):
            seen = set()
            for j in range(i + 1, n):
                c = -nums[i] - nums[j]
                if c in seen:
                    res.add((nums[i], c, nums[j]))
                seen.add(nums[j])
        return [list(t) for t in res]
