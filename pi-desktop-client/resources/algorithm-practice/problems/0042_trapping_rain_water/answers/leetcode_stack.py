from typing import List


class Solution:
    def trap(self, height: List[int]) -> int:
        stack = []
        ans = 0
        for i, h in enumerate(height):
            while stack and h > height[stack[-1]]:
                top = stack.pop()
                if not stack:
                    break
                dist = i - stack[-1] - 1
                bound = min(h, height[stack[-1]]) - height[top]
                ans += dist * bound
            stack.append(i)
        return ans
