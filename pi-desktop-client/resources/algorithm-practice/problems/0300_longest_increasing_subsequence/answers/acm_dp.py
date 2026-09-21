import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    dp = [1] * len(nums)
    for i in range(len(nums)):
        for j in range(i):
            if nums[j] < nums[i]:
                dp[i] = max(dp[i], dp[j] + 1)
    print(max(dp, default=0))


if __name__ == "__main__":
    solve()
