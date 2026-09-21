import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    cur = best = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x)
        best = max(best, cur)
    print(best)


if __name__ == "__main__":
    solve()
