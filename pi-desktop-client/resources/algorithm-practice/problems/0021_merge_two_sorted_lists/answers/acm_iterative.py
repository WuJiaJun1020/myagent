import sys
from core.types import ListNode, listnode_from_str


def solve():
    lines = sys.stdin.read().splitlines()
    l1 = listnode_from_str(lines[0])
    l2 = listnode_from_str(lines[1])
    dummy = ListNode(0)
    cur = dummy
    while l1 and l2:
        if l1.val <= l2.val:
            cur.next = l1
            l1 = l1.next
        else:
            cur.next = l2
            l2 = l2.next
        cur = cur.next
    cur.next = l1 or l2
    res = dummy.next
    print(" ".join(map(str, res.to_list())) if res else "null")


if __name__ == "__main__":
    solve()
