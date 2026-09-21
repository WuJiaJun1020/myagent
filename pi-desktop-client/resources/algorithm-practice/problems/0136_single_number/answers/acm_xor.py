import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    ans = 0
    for x in nums:
        ans ^= x
    print(ans)


if __name__ == "__main__":
    solve()
