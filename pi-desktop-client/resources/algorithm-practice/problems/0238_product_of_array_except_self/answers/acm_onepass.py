import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    n = len(nums)
    res = [1] * n
    for i in range(1, n):
        res[i] = res[i - 1] * nums[i - 1]
    right = 1
    for i in range(n - 1, -1, -1):
        res[i] *= right
        right *= nums[i]
    print(" ".join(map(str, res)))


if __name__ == "__main__":
    solve()
