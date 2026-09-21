import sys


def solve():
    grid = [line.split() for line in sys.stdin.read().splitlines() if line.strip()]
    if not grid:
        print(0)
        return
    m, n = len(grid), len(grid[0])
    count = 0

    def dfs(i, j):
        if i < 0 or i >= m or j < 0 or j >= n or grid[i][j] != "1":
            return
        grid[i][j] = "0"
        dfs(i + 1, j)
        dfs(i - 1, j)
        dfs(i, j + 1)
        dfs(i, j - 1)

    for i in range(m):
        for j in range(n):
            if grid[i][j] == "1":
                count += 1
                dfs(i, j)
    print(count)


if __name__ == "__main__":
    solve()
