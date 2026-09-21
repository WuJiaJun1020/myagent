from core.types import TreeNode

PROBLEM = {
    "id": 104,
    "title": "二叉树的最大深度",
    "slug": "maximum_depth_of_binary_tree",
    "difficulty": "easy",
    "tags": ["树", "深度优先搜索"],
    "description": (
        "给定一个二叉树 root ，返回其最大深度。\n\n"
        "二叉树的 最大深度 是指从根节点到最远叶子节点的最长路径上的节点数。"
    ),
    "examples": [
        {"input": {"root": TreeNode.from_level_order([3, 9, 20, None, None, 15, 7])}, "output": 3},
        {"input": {"root": TreeNode.from_level_order([1, None, 2])}, "output": 2},
    ],
    "constraints": [
        "树中节点的数量在 [0, 10^4] 区间内",
        "-100 <= Node.val <= 100",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "maxDepth",
        "params": [("root", "TreeNode")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("root", "TreeNode")],
        "output_type": "int",
        "description": "输入一行层序遍历数组（空格分隔，null 表示空节点）。输出最大深度。",
    },
    "test_cases": [
        {"input": {"root": TreeNode.from_level_order([3, 9, 20, None, None, 15, 7])}, "output": 3},
        {"input": {"root": TreeNode.from_level_order([1, None, 2])}, "output": 2},
        {"input": {"root": TreeNode.from_level_order([])}, "output": 0},
        {"input": {"root": TreeNode.from_level_order([1])}, "output": 1},
    ],
}
