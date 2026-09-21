import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    count = 0
    candidate = None
    for x in nums:
        if count == 0:
            candidate = x
        count += 1 if x == candidate else -1
    print(candidate)


if __name__ == "__main__":
    solve()
