import sys


def solve():
    matrix = [list(map(int, line.split())) for line in sys.stdin.read().splitlines() if line.strip()]
    n = len(matrix)
    for i in range(n):
        for j in range(i, n):
            matrix[i][j], matrix[j][i] = matrix[j][i], matrix[i][j]
    for row in matrix:
        row.reverse()
    for row in matrix:
        print(" ".join(map(str, row)))


if __name__ == "__main__":
    solve()
