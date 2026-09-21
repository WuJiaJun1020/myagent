import sys
from core.types import ListNode, listnode_from_str


def solve():
    head = listnode_from_str(sys.stdin.read().strip())
    dummy = ListNode(0, head)
    prev = dummy
    while prev.next and prev.next.next:
        a = prev.next
        b = a.next
        a.next = b.next
        b.next = a
        prev.next = b
        prev = a
    res = dummy.next
    print(" ".join(map(str, res.to_list())) if res else "null")


if __name__ == "__main__":
    solve()
