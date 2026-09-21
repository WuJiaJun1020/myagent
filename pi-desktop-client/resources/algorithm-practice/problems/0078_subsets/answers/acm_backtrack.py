import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    res = []

    def backtrack(start, path):
        res.append(path[:])
        for i in range(start, len(nums)):
            path.append(nums[i])
            backtrack(i + 1, path)
            path.pop()

    backtrack(0, [])
    for s in res:
        print(" ".join(map(str, s)))


if __name__ == "__main__":
    solve()
