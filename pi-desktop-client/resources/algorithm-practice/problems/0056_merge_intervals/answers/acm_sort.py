import sys


def solve():
    intervals = [list(map(int, line.split())) for line in sys.stdin.read().splitlines() if line.strip()]
    intervals.sort()
    res = []
    for itv in intervals:
        if not res or res[-1][1] < itv[0]:
            res.append(itv)
        else:
            res[-1][1] = max(res[-1][1], itv[1])
    for itv in res:
        print(" ".join(map(str, itv)))


if __name__ == "__main__":
    solve()
