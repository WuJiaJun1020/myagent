import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    farthest = 0
    for i, x in enumerate(nums):
        if i > farthest:
            print("false")
            return
        farthest = max(farthest, i + x)
    print("true")


if __name__ == "__main__":
    solve()
