import sys
from core.types import ListNode, listnode_from_str


def solve():
    lines = sys.stdin.read().splitlines()
    head = listnode_from_str(lines[0])
    n = int(lines[1])
    dummy = ListNode(0, head)
    fast = slow = dummy
    for _ in range(n + 1):
        fast = fast.next
    while fast:
        slow = slow.next
        fast = fast.next
    slow.next = slow.next.next
    res = dummy.next
    print(" ".join(map(str, res.to_list())) if res else "null")


if __name__ == "__main__":
    solve()
