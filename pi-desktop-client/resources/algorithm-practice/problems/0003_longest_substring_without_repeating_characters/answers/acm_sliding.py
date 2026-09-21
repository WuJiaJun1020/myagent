import sys


def solve():
    s = sys.stdin.read().rstrip("\n")
    seen = {}
    left = 0
    ans = 0
    for right, ch in enumerate(s):
        if ch in seen and seen[ch] >= left:
            left = seen[ch] + 1
        seen[ch] = right
        ans = max(ans, right - left + 1)
    print(ans)


if __name__ == "__main__":
    solve()
