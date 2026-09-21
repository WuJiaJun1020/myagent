from core.types import TreeNode

PROBLEM = {
    "id": 105,
    "title": "从前序与中序遍历序列构造二叉树",
    "slug": "construct_binary_tree_from_preorder_and_inorder_traversal",
    "difficulty": "medium",
    "tags": ["树", "数组", "哈希表", "分治"],
    "description": "给定两个整数数组 preorder 和 inorder ，其中 preorder 是二叉树的先序遍历，inorder 是同一棵树的中序遍历，请构造二叉树并返回其根节点。",
    "examples": [
        {"input": {"preorder": [3, 9, 20, 15, 7], "inorder": [9, 3, 15, 20, 7]},
         "output": TreeNode.from_level_order([3, 9, 20, None, None, 15, 7])},
        {"input": {"preorder": [-1], "inorder": [-1]}, "output": TreeNode.from_level_order([-1])},
    ],
    "constraints": [
        "1 <= preorder.length <= 3000",
        "inorder.length == preorder.length",
        "-3000 <= preorder[i], inorder[i] <= 3000",
        "preorder 和 inorder 均无重复元素",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "buildTree",
        "params": [("preorder", "List[int]"), ("inorder", "List[int]")],
        "return": "TreeNode",
    },
    "acm": {
        "input_fields": [("preorder", "List[int]"), ("inorder", "List[int]")],
        "output_type": "TreeNode",
        "description": "第一行：preorder（空格分隔）；第二行：inorder（空格分隔）。输出构造树的层序遍历。",
    },
    "test_cases": [
        {"input": {"preorder": [3, 9, 20, 15, 7], "inorder": [9, 3, 15, 20, 7]},
         "output": TreeNode.from_level_order([3, 9, 20, None, None, 15, 7])},
        {"input": {"preorder": [-1], "inorder": [-1]}, "output": TreeNode.from_level_order([-1])},
    ],
}
