import sys


def solve():
    lines = sys.stdin.read().splitlines()
    nums = list(map(int, lines[0].split()))
    target = int(lines[1])
    seen = {}
    for i, v in enumerate(nums):
        if target - v in seen:
            print(seen[target - v], i)
            return
        seen[v] = i


if __name__ == "__main__":
    solve()
