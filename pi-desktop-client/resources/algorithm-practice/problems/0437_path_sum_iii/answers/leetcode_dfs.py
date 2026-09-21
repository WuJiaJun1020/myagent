from typing import Optional
from core.types import TreeNode


class Solution:
    def pathSum(self, root: Optional[TreeNode], targetSum: int) -> int:
        def count_from(node, target):
            if not node:
                return 0
            return (1 if node.val == target else 0) + count_from(node.left, target - node.val) + count_from(node.right, target - node.val)

        if not root:
            return 0
        return count_from(root, targetSum) + self.pathSum(root.left, targetSum) + self.pathSum(root.right, targetSum)
