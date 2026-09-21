from typing import Optional
from core.types import TreeNode
from collections import deque


class Solution:
    def isSymmetric(self, root: Optional[TreeNode]) -> bool:
        q = deque([root, root])
        while q:
            a = q.popleft()
            b = q.popleft()
            if not a and not b:
                continue
            if not a or not b or a.val != b.val:
                return False
            q.append(a.left)
            q.append(b.right)
            q.append(a.right)
            q.append(b.left)
        return True
