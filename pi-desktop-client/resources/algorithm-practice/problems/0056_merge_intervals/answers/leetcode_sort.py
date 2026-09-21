from typing import List


class Solution:
    def merge(self, intervals: List[List[int]]) -> List[List[int]]:
        intervals.sort()
        res = []
        for itv in intervals:
            if not res or res[-1][1] < itv[0]:
                res.append(itv)
            else:
                res[-1][1] = max(res[-1][1], itv[1])
        return res
