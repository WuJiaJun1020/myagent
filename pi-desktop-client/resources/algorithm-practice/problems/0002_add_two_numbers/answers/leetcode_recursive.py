from typing import Optional
from core.types import ListNode


class Solution:
    def addTwoNumbers(self, l1: Optional[ListNode], l2: Optional[ListNode], carry: int = 0) -> Optional[ListNode]:
        if not l1 and not l2 and not carry:
            return None
        s = carry + (l1.val if l1 else 0) + (l2.val if l2 else 0)
        node = ListNode(s % 10)
        node.next = self.addTwoNumbers(l1.next if l1 else None, l2.next if l2 else None, s // 10)
        return node
