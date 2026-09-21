import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    j = 0
    for i in range(len(nums)):
        if nums[i] != 0:
            nums[j] = nums[i]
            j += 1
    for k in range(j, len(nums)):
        nums[k] = 0
    print(" ".join(map(str, nums)))


if __name__ == "__main__":
    solve()
