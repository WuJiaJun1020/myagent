from typing import List


class Solution:
    def largestRectangleArea(self, heights: List[int]) -> int:
        stack = []
        ans = 0
        heights = heights + [0]
        for i, h in enumerate(heights):
            while stack and h < heights[stack[-1]]:
                top = stack.pop()
                width = i if not stack else i - stack[-1] - 1
                ans = max(ans, heights[top] * width)
            stack.append(i)
        return ans
