import sys
from core.types import ListNode, listnode_from_str


def solve():
    lines = sys.stdin.read().splitlines()
    head = listnode_from_str(lines[0])
    k = int(lines[1])
    dummy = ListNode(0, head)
    prev_group = dummy
    while True:
        kth = prev_group
        for _ in range(k):
            kth = kth.next
            if not kth:
                break
        else:
            group_start = prev_group.next
            cur = group_start
            prev = kth.next
            for _ in range(k):
                nxt = cur.next
                cur.next = prev
                prev = cur
                cur = nxt
            prev_group.next = prev
            prev_group = group_start
            continue
        break
    res = dummy.next
    print(" ".join(map(str, res.to_list())) if res else "null")


if __name__ == "__main__":
    solve()
