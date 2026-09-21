import sys


def solve():
    n = int(sys.stdin.read().strip())
    res = []

    def backtrack(s, left, right):
        if len(s) == 2 * n:
            res.append(s)
            return
        if left < n:
            backtrack(s + "(", left + 1, right)
        if right < left:
            backtrack(s + ")", left, right + 1)

    backtrack("", 0, 0)
    print(" ".join(res))


if __name__ == "__main__":
    solve()
