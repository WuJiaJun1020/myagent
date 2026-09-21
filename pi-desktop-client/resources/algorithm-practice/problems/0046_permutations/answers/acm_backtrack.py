import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    res = []

    def backtrack(path, used):
        if len(path) == len(nums):
            res.append(path[:])
            return
        for i in range(len(nums)):
            if not used[i]:
                used[i] = True
                path.append(nums[i])
                backtrack(path, used)
                path.pop()
                used[i] = False

    backtrack([], [False] * len(nums))
    for p in res:
        print(" ".join(map(str, p)))


if __name__ == "__main__":
    solve()
