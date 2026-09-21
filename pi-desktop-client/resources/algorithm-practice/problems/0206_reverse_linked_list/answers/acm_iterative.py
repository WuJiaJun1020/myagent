import sys
from core.types import listnode_from_str


def solve():
    head = listnode_from_str(sys.stdin.read().strip())
    prev = None
    cur = head
    while cur:
        nxt = cur.next
        cur.next = prev
        prev = cur
        cur = nxt
    print(" ".join(map(str, prev.to_list())) if prev else "null")


if __name__ == "__main__":
    solve()
