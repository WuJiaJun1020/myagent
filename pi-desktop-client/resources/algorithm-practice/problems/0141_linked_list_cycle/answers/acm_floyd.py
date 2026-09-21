import sys
from core.types import make_cycle


def solve():
    lines = sys.stdin.read().splitlines()
    values = list(map(int, lines[0].split())) if lines[0].strip() else []
    pos = int(lines[1])
    head = make_cycle(values, pos)
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            print("true")
            return
    print("false")


if __name__ == "__main__":
    solve()
