import sys


def solve():
    nums = list(map(int, sys.stdin.read().split()))
    slow = fast = nums[0]
    while True:
        slow = nums[slow]
        fast = nums[nums[fast]]
        if slow == fast:
            break
    slow = nums[0]
    while slow != fast:
        slow = nums[slow]
        fast = nums[fast]
    print(slow)


if __name__ == "__main__":
    solve()
