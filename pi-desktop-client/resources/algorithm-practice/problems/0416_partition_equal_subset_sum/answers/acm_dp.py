import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    total = sum(nums)
    if total % 2 != 0:
        print("false")
        return
    target = total // 2
    dp = [False] * (target + 1)
    dp[0] = True
    for num in nums:
        for j in range(target, num - 1, -1):
            dp[j] = dp[j] or dp[j - num]
    print("true" if dp[target] else "false")


if __name__ == "__main__":
    solve()
