import sys


def solve():
    prices = list(map(int, sys.stdin.read().split()))
    min_price = float("inf")
    ans = 0
    for p in prices:
        min_price = min(min_price, p)
        ans = max(ans, p - min_price)
    print(ans)


if __name__ == "__main__":
    solve()
