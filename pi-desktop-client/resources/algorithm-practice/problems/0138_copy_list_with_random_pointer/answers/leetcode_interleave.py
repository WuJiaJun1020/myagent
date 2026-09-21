from typing import Optional
from core.types import RandomListNode


class Solution:
    def copyRandomList(self, head: Optional[RandomListNode]) -> Optional[RandomListNode]:
        if not head:
            return None
        cur = head
        while cur:
            new = RandomListNode(cur.val)
            new.next = cur.next
            cur.next = new
            cur = new.next
        cur = head
        while cur:
            if cur.random:
                cur.next.random = cur.random.next
            cur = cur.next.next
        old = head
        new_head = head.next
        new = new_head
        while old:
            old.next = old.next.next
            new.next = new.next.next if new.next else None
            old = old.next
            new = new.next
        return new_head
