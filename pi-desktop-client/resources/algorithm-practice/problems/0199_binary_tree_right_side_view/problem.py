from core.types import TreeNode

PROBLEM = {
    "id": 199,
    "title": "二叉树的右视图",
    "slug": "binary_tree_right_side_view",
    "difficulty": "medium",
    "tags": ["树", "深度优先搜索", "广度优先搜索"],
    "description": "给定一个二叉树的根节点 root，想象自己站在它的右侧，按照从顶部到底部的顺序，返回从右侧所能看到的节点值。",
    "examples": [
        {"input": {"root": TreeNode.from_level_order([1, 2, 3, None, 5, None, 4])}, "output": [1, 3, 4]},
        {"input": {"root": TreeNode.from_level_order([1, None, 3])}, "output": [1, 3]},
        {"input": {"root": TreeNode.from_level_order([])}, "output": []},
    ],
    "constraints": [
        "二叉树的节点个数的范围是 [0,100]",
        "-100 <= Node.val <= 100",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "rightSideView",
        "params": [("root", "TreeNode")],
        "return": "List[int]",
    },
    "acm": {
        "input_fields": [("root", "TreeNode")],
        "output_type": "List[int]",
        "description": "输入一行层序遍历数组（空格分隔，null 表示空节点）。输出右视图（空格分隔）。",
    },
    "test_cases": [
        {"input": {"root": TreeNode.from_level_order([1, 2, 3, None, 5, None, 4])}, "output": [1, 3, 4]},
        {"input": {"root": TreeNode.from_level_order([1, None, 3])}, "output": [1, 3]},
        {"input": {"root": TreeNode.from_level_order([])}, "output": []},
        {"input": {"root": TreeNode.from_level_order([1, 2, 3, 4])}, "output": [1, 3, 4]},
    ],
}
