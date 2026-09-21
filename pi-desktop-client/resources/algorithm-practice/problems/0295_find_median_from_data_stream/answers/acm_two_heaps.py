import sys
import json
import heapq


class MedianFinder:
    def __init__(self):
        self.small = []
        self.large = []

    def addNum(self, num):
        heapq.heappush(self.small, -num)
        heapq.heappush(self.large, -heapq.heappop(self.small))
        if len(self.large) > len(self.small):
            heapq.heappush(self.small, -heapq.heappop(self.large))

    def findMedian(self):
        if len(self.small) > len(self.large):
            return float(-self.small[0])
        return (-self.small[0] + self.large[0]) / 2


def solve():
    lines = sys.stdin.read().splitlines()
    ops = json.loads(lines[0])
    args = json.loads(lines[1])
    obj = None
    results = []
    for op, a in zip(ops, args):
        if op == "MedianFinder":
            obj = MedianFinder(*a)
            results.append(None)
        else:
            results.append(getattr(obj, op)(*a))
    print(json.dumps(results))


if __name__ == "__main__":
    solve()
