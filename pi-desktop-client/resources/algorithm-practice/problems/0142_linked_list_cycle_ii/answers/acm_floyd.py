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
            break
    else:
        print(-1)
        return

    slow = head
    while slow is not fast:
        slow = slow.next
        fast = fast.next

    idx = 0
    cur = head
    while cur is not slow:
        cur = cur.next
        idx += 1
    print(idx)


if __name__ == "__main__":
    solve()
