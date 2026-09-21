import sys


def solve():
    lines = sys.stdin.read().splitlines()
    s = lines[0]
    words = set(lines[1].split())
    dp = [False] * (len(s) + 1)
    dp[0] = True
    for i in range(1, len(s) + 1):
        for j in range(i):
            if dp[j] and s[j:i] in words:
                dp[i] = True
                break
    print("true" if dp[-1] else "false")


if __name__ == "__main__":
    solve()
