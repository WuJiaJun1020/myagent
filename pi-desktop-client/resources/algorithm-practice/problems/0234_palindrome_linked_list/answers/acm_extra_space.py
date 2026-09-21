import sys
from core.types import listnode_from_str


def solve():
    head = listnode_from_str(sys.stdin.read().strip())
    vals = []
    cur = head
    while cur:
        vals.append(cur.val)
        cur = cur.next
    print("true" if vals == vals[::-1] else "false")


if __name__ == "__main__":
    solve()
