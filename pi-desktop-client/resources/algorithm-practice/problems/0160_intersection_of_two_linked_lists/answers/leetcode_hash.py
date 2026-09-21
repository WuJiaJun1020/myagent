from typing import Optional
from core.types import ListNode


class Solution:
    def getIntersectionNode(self, headA: Optional[ListNode], headB: Optional[ListNode]) -> Optional[ListNode]:
        seen = set()
        cur = headA
        while cur:
            seen.add(cur)
            cur = cur.next
        cur = headB
        while cur:
            if cur in seen:
                return cur
            cur = cur.next
        return None
