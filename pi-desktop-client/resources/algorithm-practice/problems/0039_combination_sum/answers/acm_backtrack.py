import sys


def solve():
    lines = sys.stdin.read().splitlines()
    candidates = list(map(int, lines[0].split()))
    target = int(lines[1])
    res = []

    def backtrack(start, path, remain):
        if remain == 0:
            res.append(path[:])
            return
        for i in range(start, len(candidates)):
            if candidates[i] <= remain:
                path.append(candidates[i])
                backtrack(i, path, remain - candidates[i])
                path.pop()

    backtrack(0, [], target)
    for c in res:
        print(" ".join(map(str, c)))


if __name__ == "__main__":
    solve()
