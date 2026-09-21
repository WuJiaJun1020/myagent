import sys
import heapq
from collections import Counter


def solve():
    lines = sys.stdin.read().splitlines()
    nums = list(map(int, lines[0].split()))
    k = int(lines[1])
    freq = Counter(nums)
    heap = []
    for num, cnt in freq.items():
        heapq.heappush(heap, (cnt, num))
        if len(heap) > k:
            heapq.heappop(heap)
    print(" ".join(map(str, [num for _, num in heap])))


if __name__ == "__main__":
    solve()
