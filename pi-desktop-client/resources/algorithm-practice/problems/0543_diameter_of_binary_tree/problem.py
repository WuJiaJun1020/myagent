from core.types import TreeNode

PROBLEM = {
    "id": 543,
    "title": "二叉树的直径",
    "slug": "diameter_of_binary_tree",
    "difficulty": "easy",
    "tags": ["树", "深度优先搜索"],
    "description": (
        "给你一棵二叉树的根节点，返回该树的直径。\n\n"
        "二叉树的直径是指树中任意两个节点之间最长路径的长度。这条路径可能经过也可能不经过根节点 root 。\n\n"
        "两节点之间路径的长度由它们之间边数表示。"
    ),
    "examples": [
        {"input": {"root": TreeNode.from_level_order([1, 2, 3, 4, 5])}, "output": 3},
        {"input": {"root": TreeNode.from_level_order([1, 2])}, "output": 1},
    ],
    "constraints": [
        "树中节点数目在范围 [1, 10^4] 内",
        "-100 <= Node.val <= 100",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "diameterOfBinaryTree",
        "params": [("root", "TreeNode")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("root", "TreeNode")],
        "output_type": "int",
        "description": "输入一行层序遍历数组（空格分隔，null 表示空节点）。输出直径。",
    },
    "test_cases": [
        {"input": {"root": TreeNode.from_level_order([1, 2, 3, 4, 5])}, "output": 3},
        {"input": {"root": TreeNode.from_level_order([1, 2])}, "output": 1},
        {"input": {"root": TreeNode.from_level_order([1])}, "output": 0},
    ],
}
