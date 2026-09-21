import sys


def solve():
    lines = sys.stdin.read().splitlines()
    nums = list(map(int, lines[0].split())) if lines[0].strip() else []
    target = int(lines[1])

    def lower():
        l, r = 0, len(nums) - 1
        while l <= r:
            m = (l + r) // 2
            if nums[m] < target:
                l = m + 1
            else:
                r = m - 1
        return l

    def upper():
        l, r = 0, len(nums) - 1
        while l <= r:
            m = (l + r) // 2
            if nums[m] <= target:
                l = m + 1
            else:
                r = m - 1
        return r

    start, end = lower(), upper()
    if start <= end:
        print(start, end)
    else:
        print(-1, -1)


if __name__ == "__main__":
    solve()
