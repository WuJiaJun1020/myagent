import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    s = set(nums)
    ans = 0
    for x in s:
        if x - 1 not in s:
            cur = 1
            while x + 1 in s:
                x += 1
                cur += 1
            ans = max(ans, cur)
    print(ans)


if __name__ == "__main__":
    solve()
