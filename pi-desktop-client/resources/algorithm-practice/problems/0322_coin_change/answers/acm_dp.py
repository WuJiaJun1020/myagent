import sys


def solve():
    lines = sys.stdin.read().splitlines()
    coins = list(map(int, lines[0].split()))
    amount = int(lines[1])
    dp = [0] + [float("inf")] * amount
    for i in range(1, amount + 1):
        for c in coins:
            if c <= i:
                dp[i] = min(dp[i], dp[i - c] + 1)
    print(dp[amount] if dp[amount] != float("inf") else -1)


if __name__ == "__main__":
    solve()
