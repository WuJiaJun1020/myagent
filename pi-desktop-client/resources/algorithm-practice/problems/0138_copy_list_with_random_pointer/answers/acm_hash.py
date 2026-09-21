import sys
import json
from core.types import RandomListNode, build_random_list, random_list_to_data


def solve():
    data = json.loads(sys.stdin.read())
    head = build_random_list(data)
    if not head:
        print("[]")
        return
    mapping = {}
    cur = head
    while cur:
        mapping[cur] = RandomListNode(cur.val)
        cur = cur.next
    cur = head
    while cur:
        mapping[cur].next = mapping.get(cur.next)
        mapping[cur].random = mapping.get(cur.random)
        cur = cur.next
    print(json.dumps(random_list_to_data(mapping[head])))


if __name__ == "__main__":
    solve()
