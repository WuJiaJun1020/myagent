from core.types import TreeNode

PROBLEM = {
    "id": 124,
    "title": "二叉树中的最大路径和",
    "slug": "binary_tree_maximum_path_sum",
    "difficulty": "hard",
    "tags": ["树", "深度优先搜索", "动态规划"],
    "description": (
        "二叉树中的路径被定义为一条节点序列，序列中每对相邻节点之间都存在一条边。同一个节点在一条路径序列中至多出现一次。"
        "该路径至少包含一个节点，且不一定经过根节点。\n\n"
        "路径和是路径中各节点值的总和。\n\n"
        "给你一个二叉树的根节点 root ，返回其最大路径和。"
    ),
    "examples": [
        {"input": {"root": TreeNode.from_level_order([1, 2, 3])}, "output": 6},
        {"input": {"root": TreeNode.from_level_order([-10, 9, 20, None, None, 15, 7])}, "output": 42},
    ],
    "constraints": [
        "树中节点数目范围是 [1, 3 * 10^4]",
        "-1000 <= Node.val <= 1000",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "maxPathSum",
        "params": [("root", "TreeNode")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("root", "TreeNode")],
        "output_type": "int",
        "description": "输入一行层序遍历数组（空格分隔，null 表示空节点）。输出最大路径和。",
    },
    "test_cases": [
        {"input": {"root": TreeNode.from_level_order([1, 2, 3])}, "output": 6},
        {"input": {"root": TreeNode.from_level_order([-10, 9, 20, None, None, 15, 7])}, "output": 42},
        {"input": {"root": TreeNode.from_level_order([-3])}, "output": -3},
        {"input": {"root": TreeNode.from_level_order([2, -1])}, "output": 2},
    ],
}
