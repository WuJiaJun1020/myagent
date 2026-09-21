import sys


def solve():
    lines = sys.stdin.read().splitlines()
    target = int(lines[-1])
    matrix = [list(map(int, line.split())) for line in lines[:-1]]
    m, n = len(matrix), len(matrix[0])
    i, j = 0, n - 1
    while i < m and j >= 0:
        if matrix[i][j] == target:
            print("true")
            return
        if matrix[i][j] > target:
            j -= 1
        else:
            i += 1
    print("false")


if __name__ == "__main__":
    solve()
