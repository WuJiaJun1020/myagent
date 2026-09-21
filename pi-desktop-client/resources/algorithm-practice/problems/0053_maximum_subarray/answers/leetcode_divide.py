from typing import List


class Solution:
    def maxSubArray(self, nums: List[int]) -> int:
        def dc(l, r):
            if l == r:
                return nums[l]
            m = (l + r) // 2
            left_max = dc(l, m)
            right_max = dc(m + 1, r)
            cross_left = float("-inf")
            s = 0
            for i in range(m, l - 1, -1):
                s += nums[i]
                cross_left = max(cross_left, s)
            cross_right = float("-inf")
            s = 0
            for i in range(m + 1, r + 1):
                s += nums[i]
                cross_right = max(cross_right, s)
            return max(left_max, right_max, cross_left + cross_right)

        return dc(0, len(nums) - 1)
