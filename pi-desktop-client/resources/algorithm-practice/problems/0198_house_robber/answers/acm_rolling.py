import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    prev2 = prev1 = 0
    for n in nums:
        prev2, prev1 = prev1, max(prev1, prev2 + n)
    print(prev1)


if __name__ == "__main__":
    solve()
