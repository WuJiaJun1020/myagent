from typing import List, Optional
from core.types import TreeNode


class Solution:
    def buildTree(self, preorder: List[int], inorder: List[int]) -> Optional[TreeNode]:
        idx_map = {v: i for i, v in enumerate(inorder)}

        def build(pre_l, pre_r, in_l, in_r):
            if pre_l > pre_r:
                return None
            root = TreeNode(preorder[pre_l])
            idx = idx_map[root.val]
            left_size = idx - in_l
            root.left = build(pre_l + 1, pre_l + left_size, in_l, idx - 1)
            root.right = build(pre_l + left_size + 1, pre_r, idx + 1, in_r)
            return root

        return build(0, len(preorder) - 1, 0, len(inorder) - 1)
