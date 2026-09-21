import sys


def solve():
    lines = sys.stdin.read().splitlines()
    m = int(lines[0])
    n = int(lines[1])
    dp = [[1] * n for _ in range(m)]
    for i in range(1, m):
        for j in range(1, n):
            dp[i][j] = dp[i - 1][j] + dp[i][j - 1]
    print(dp[-1][-1])


if __name__ == "__main__":
    solve()
