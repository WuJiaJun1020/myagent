import sys
import heapq
from core.types import ListNode, listnode_from_str


def solve():
    lists = [listnode_from_str(line) for line in sys.stdin.read().splitlines()]
    heap = []
    for i, node in enumerate(lists):
        if node:
            heapq.heappush(heap, (node.val, i, node))
    dummy = ListNode(0)
    cur = dummy
    while heap:
        val, i, node = heapq.heappop(heap)
        cur.next = node
        cur = cur.next
        if node.next:
            heapq.heappush(heap, (node.next.val, i, node.next))
    res = dummy.next
    print(" ".join(map(str, res.to_list())) if res else "null")


if __name__ == "__main__":
    solve()
