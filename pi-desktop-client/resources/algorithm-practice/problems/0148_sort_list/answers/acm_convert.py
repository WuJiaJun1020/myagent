import sys
from core.types import ListNode, listnode_from_str


def solve():
    head = listnode_from_str(sys.stdin.read().strip())
    vals = []
    cur = head
    while cur:
        vals.append(cur.val)
        cur = cur.next
    vals.sort()
    dummy = ListNode(0)
    cur = dummy
    for v in vals:
        cur.next = ListNode(v)
        cur = cur.next
    res = dummy.next
    print(" ".join(map(str, res.to_list())) if res else "null")


if __name__ == "__main__":
    solve()
