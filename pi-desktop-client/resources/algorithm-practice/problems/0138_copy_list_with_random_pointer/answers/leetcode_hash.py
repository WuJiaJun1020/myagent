from typing import Optional
from core.types import RandomListNode


class Solution:
    def copyRandomList(self, head: Optional[RandomListNode]) -> Optional[RandomListNode]:
        if not head:
            return None
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
        return mapping[head]
