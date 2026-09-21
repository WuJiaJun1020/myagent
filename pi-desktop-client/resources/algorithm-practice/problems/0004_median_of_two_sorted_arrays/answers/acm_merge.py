import sys


def solve():
    lines = sys.stdin.read().splitlines()
    nums1 = list(map(int, lines[0].split())) if lines[0].strip() else []
    nums2 = list(map(int, lines[1].split())) if len(lines) > 1 and lines[1].strip() else []
    merged = sorted(nums1 + nums2)
    n = len(merged)
    if n % 2 == 1:
        print(float(merged[n // 2]))
    else:
        print((merged[n // 2 - 1] + merged[n // 2]) / 2)


if __name__ == "__main__":
    solve()
