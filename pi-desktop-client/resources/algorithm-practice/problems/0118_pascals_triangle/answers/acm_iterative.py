import sys


def solve():
    numRows = int(sys.stdin.read().strip())
    res = []
    for i in range(numRows):
        row = [1] * (i + 1)
        for j in range(1, i):
            row[j] = res[i - 1][j - 1] + res[i - 1][j]
        res.append(row)
    for row in res:
        print(" ".join(map(str, row)))


if __name__ == "__main__":
    solve()
