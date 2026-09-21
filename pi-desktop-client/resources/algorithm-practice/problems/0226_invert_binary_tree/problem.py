from core.types import TreeNode

PROBLEM = {
    "id": 226,
    "title": "翻转二叉树",
    "slug": "invert_binary_tree",
    "difficulty": "easy",
    "tags": ["树", "深度优先搜索", "广度优先搜索"],
    "description": "给你一棵二叉树的根节点 root ，翻转这棵二叉树，并返回其根节点。",
    "examples": [
        {"input": {"root": TreeNode.from_level_order([4, 2, 7, 1, 3, 6, 9])},
         "output": TreeNode.from_level_order([4, 7, 2, 9, 6, 3, 1])},
        {"input": {"root": TreeNode.from_level_order([2, 1, 3])},
         "output": TreeNode.from_level_order([2, 3, 1])},
        {"input": {"root": TreeNode.from_level_order([])},
         "output": TreeNode.from_level_order([])},
    ],
    "constraints": [
        "树中节点数目范围在 [0, 100] 内",
        "-100 <= Node.val <= 100",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "invertTree",
        "params": [("root", "TreeNode")],
        "return": "TreeNode",
    },
    "acm": {
        "input_fields": [("root", "TreeNode")],
        "output_type": "TreeNode",
        "description": "输入一行层序遍历数组（空格分隔，null 表示空节点）。输出翻转后树的层序遍历。",
    },
    "test_cases": [
        {"input": {"root": TreeNode.from_level_order([4, 2, 7, 1, 3, 6, 9])},
         "output": TreeNode.from_level_order([4, 7, 2, 9, 6, 3, 1])},
        {"input": {"root": TreeNode.from_level_order([2, 1, 3])},
         "output": TreeNode.from_level_order([2, 3, 1])},
        {"input": {"root": TreeNode.from_level_order([])},
         "output": TreeNode.from_level_order([])},
        {"input": {"root": TreeNode.from_level_order([1])},
         "output": TreeNode.from_level_order([1])},
        {"input": {"root": TreeNode.from_level_order([1, 2])},
         "output": TreeNode.from_level_order([1, None, 2])},
    ],
}
