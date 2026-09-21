import sys


def solve():
    height = list(map(int, sys.stdin.read().split()))
    l, r = 0, len(height) - 1
    ans = 0
    while l < r:
        ans = max(ans, min(height[l], height[r]) * (r - l))
        if height[l] < height[r]:
            l += 1
        else:
            r -= 1
    print(ans)


if __name__ == "__main__":
    solve()
