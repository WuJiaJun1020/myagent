import sys
from collections import defaultdict


def solve():
    strs = sys.stdin.read().split()
    groups = defaultdict(list)
    for s in strs:
        groups["".join(sorted(s))].append(s)
    for g in groups.values():
        print(" ".join(g))


if __name__ == "__main__":
    solve()
