import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    cur_max = cur_min = ans = nums[0]
    for x in nums[1:]:
        candidates = (cur_max * x, cur_min * x, x)
        cur_max = max(candidates)
        cur_min = min(candidates)
        ans = max(ans, cur_max)
    print(ans)


if __name__ == "__main__":
    solve()
