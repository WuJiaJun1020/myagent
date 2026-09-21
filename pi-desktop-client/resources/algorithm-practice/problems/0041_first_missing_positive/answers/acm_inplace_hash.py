import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    n = len(nums)
    for i in range(n):
        while 1 <= nums[i] <= n and nums[nums[i] - 1] != nums[i]:
            nums[nums[i] - 1], nums[i] = nums[i], nums[nums[i] - 1]
    for i in range(n):
        if nums[i] != i + 1:
            print(i + 1)
            return
    print(n + 1)


if __name__ == "__main__":
    solve()
