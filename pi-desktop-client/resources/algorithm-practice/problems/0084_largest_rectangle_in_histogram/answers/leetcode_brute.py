from typing import List


class Solution:
    def largestRectangleArea(self, heights: List[int]) -> int:
        ans = 0
        for i in range(len(heights)):
            h = heights[i]
            for j in range(i, len(heights)):
                h = min(h, heights[j])
                ans = max(ans, h * (j - i + 1))
        return ans
