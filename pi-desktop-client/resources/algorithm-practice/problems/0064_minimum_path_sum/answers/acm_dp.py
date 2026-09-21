import sys


def solve():
    grid = [list(map(int, line.split())) for line in sys.stdin.read().splitlines() if line.strip()]
    m, n = len(grid), len(grid[0])
    dp = [0] * n
    for i in range(m):
        for j in range(n):
            if i == 0 and j == 0:
                dp[j] = grid[i][j]
            elif i == 0:
                dp[j] = dp[j - 1] + grid[i][j]
            elif j == 0:
                dp[j] = dp[j] + grid[i][j]
            else:
                dp[j] = min(dp[j], dp[j - 1]) + grid[i][j]
    print(dp[-1])


if __name__ == "__main__":
    solve()
