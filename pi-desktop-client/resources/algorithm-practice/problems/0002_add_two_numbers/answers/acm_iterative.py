import sys
from core.types import ListNode, listnode_from_str


def solve():
    lines = sys.stdin.read().splitlines()
    l1 = listnode_from_str(lines[0])
    l2 = listnode_from_str(lines[1])
    dummy = ListNode(0)
    cur = dummy
    carry = 0
    while l1 or l2 or carry:
        s = carry + (l1.val if l1 else 0) + (l2.val if l2 else 0)
        carry, val = divmod(s, 10)
        cur.next = ListNode(val)
        cur = cur.next
        l1 = l1.next if l1 else None
        l2 = l2.next if l2 else None
    res = dummy.next
    print(" ".join(map(str, res.to_list())) if res else "null")


if __name__ == "__main__":
    solve()
