from core.types import TreeNode

PROBLEM = {
    "id": 101,
    "title": "对称二叉树",
    "slug": "symmetric_tree",
    "difficulty": "easy",
    "tags": ["树", "深度优先搜索"],
    "description": "给你一个二叉树的根节点 root ，检查它是否轴对称。",
    "examples": [
        {"input": {"root": TreeNode.from_level_order([1, 2, 2, 3, 4, 4, 3])}, "output": True},
        {"input": {"root": TreeNode.from_level_order([1, 2, 2, None, 3, None, 3])}, "output": False},
    ],
    "constraints": [
        "树中节点数目在范围 [1, 1000] 内",
        "-100 <= Node.val <= 100",
    ],
    "follow_up": "你可以运用递归和迭代两种方法解决这个问题吗？",
    "leetcode": {
        "class": "Solution",
        "method": "isSymmetric",
        "params": [("root", "TreeNode")],
        "return": "bool",
    },
    "acm": {
        "input_fields": [("root", "TreeNode")],
        "output_type": "bool",
        "description": "输入一行层序遍历数组（空格分隔，null 表示空节点）。输出 true 或 false（小写）。",
    },
    "test_cases": [
        {"input": {"root": TreeNode.from_level_order([1, 2, 2, 3, 4, 4, 3])}, "output": True},
        {"input": {"root": TreeNode.from_level_order([1, 2, 2, None, 3, None, 3])}, "output": False},
        {"input": {"root": TreeNode.from_level_order([1])}, "output": True},
        {"input": {"root": TreeNode.from_level_order([])}, "output": True},
        {"input": {"root": TreeNode.from_level_order([1, 2, 2, None, 3, 3])}, "output": True},
    ],
}
