from typing import List


class Solution:
    def singleNumber(self, nums: List[int]) -> int:
        seen = set()
        for x in nums:
            if x in seen:
                seen.remove(x)
            else:
                seen.add(x)
        return seen.pop()
