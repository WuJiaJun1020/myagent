import sys
from collections import defaultdict


def solve():
    lines = sys.stdin.read().splitlines()
    nums = list(map(int, lines[0].split()))
    k = int(lines[1])
    count = 0
    prefix = 0
    seen = defaultdict(int)
    seen[0] = 1
    for x in nums:
        prefix += x
        count += seen[prefix - k]
        seen[prefix] += 1
    print(count)


if __name__ == "__main__":
    solve()
