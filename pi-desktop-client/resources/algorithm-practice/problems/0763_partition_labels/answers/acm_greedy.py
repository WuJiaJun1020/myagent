import sys


def solve():
    s = sys.stdin.read().rstrip("\n")
    last = {ch: i for i, ch in enumerate(s)}
    res = []
    start = end = 0
    for i, ch in enumerate(s):
        end = max(end, last[ch])
        if i == end:
            res.append(end - start + 1)
            start = end + 1
    print(" ".join(map(str, res)))


if __name__ == "__main__":
    solve()
