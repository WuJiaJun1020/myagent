import sys


def solve():
    n = int(sys.stdin.read().strip())
    prev2, prev1 = 1, 1
    for _ in range(2, n + 1):
        prev2, prev1 = prev1, prev2 + prev1
    print(prev1)


if __name__ == "__main__":
    solve()
