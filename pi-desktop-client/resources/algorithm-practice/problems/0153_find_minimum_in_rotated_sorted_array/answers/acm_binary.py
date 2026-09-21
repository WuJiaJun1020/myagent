import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    l, r = 0, len(nums) - 1
    while l < r:
        m = (l + r) // 2
        if nums[m] > nums[r]:
            l = m + 1
        else:
            r = m
    print(nums[l])


if __name__ == "__main__":
    solve()
