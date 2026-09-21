import sys


def solve():
    lines = sys.stdin.read().splitlines()
    target = int(lines[-1])
    matrix = [list(map(int, line.split())) for line in lines[:-1]]
    m, n = len(matrix), len(matrix[0])
    l, r = 0, m * n - 1
    while l <= r:
        mid = (l + r) // 2
        val = matrix[mid // n][mid % n]
        if val == target:
            print("true")
            return
        if val < target:
            l = mid + 1
        else:
            r = mid - 1
    print("false")


if __name__ == "__main__":
    solve()
