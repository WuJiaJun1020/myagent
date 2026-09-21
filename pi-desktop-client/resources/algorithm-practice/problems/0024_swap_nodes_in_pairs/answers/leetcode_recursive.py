from typing import Optional
from core.types import ListNode


class Solution:
    def swapPairs(self, head: Optional[ListNode]) -> Optional[ListNode]:
        if not head or not head.next:
            return head
        nxt = head.next
        head.next = self.swapPairs(nxt.next)
        nxt.next = head
        return nxt
