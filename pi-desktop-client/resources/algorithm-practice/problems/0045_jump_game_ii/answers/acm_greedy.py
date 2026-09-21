import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    jumps = 0
    cur_end = 0
    farthest = 0
    for i in range(len(nums) - 1):
        farthest = max(farthest, i + nums[i])
        if i == cur_end:
            jumps += 1
            cur_end = farthest
    print(jumps)


if __name__ == "__main__":
    solve()
