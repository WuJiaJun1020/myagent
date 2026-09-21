import sys
import heapq


def solve():
    lines = sys.stdin.read().splitlines()
    nums = list(map(int, lines[0].split()))
    k = int(lines[1])
    heap = []
    for x in nums:
        heapq.heappush(heap, x)
        if len(heap) > k:
            heapq.heappop(heap)
    print(heap[0])


if __name__ == "__main__":
    solve()
