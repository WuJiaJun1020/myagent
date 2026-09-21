from core.types import TreeNode

PROBLEM = {
    "id": 98,
    "title": "验证二叉搜索树",
    "slug": "validate_binary_search_tree",
    "difficulty": "medium",
    "tags": ["树", "深度优先搜索", "二叉搜索树"],
    "description": (
        "给你一个二叉树的根节点 root ，判断其是否是一个有效的二叉搜索树。\n\n"
        "有效二叉搜索树定义如下：\n"
        "- 节点的左子树只包含小于当前节点的数。\n"
        "- 节点的右子树只包含大于当前节点的数。\n"
        "- 所有左子树和右子树自身必须也是二叉搜索树。"
    ),
    "examples": [
        {"input": {"root": TreeNode.from_level_order([2, 1, 3])}, "output": True},
        {"input": {"root": TreeNode.from_level_order([5, 1, 4, None, None, 3, 6])}, "output": False},
    ],
    "constraints": [
        "树中节点数目范围在 [1, 10^4] 内",
        "-2^31 <= Node.val <= 2^31 - 1",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "isValidBST",
        "params": [("root", "TreeNode")],
        "return": "bool",
    },
    "acm": {
        "input_fields": [("root", "TreeNode")],
        "output_type": "bool",
        "description": "输入一行层序遍历数组（空格分隔，null 表示空节点）。输出 true 或 false（小写）。",
    },
    "test_cases": [
        {"input": {"root": TreeNode.from_level_order([2, 1, 3])}, "output": True},
        {"input": {"root": TreeNode.from_level_order([5, 1, 4, None, None, 3, 6])}, "output": False},
        {"input": {"root": TreeNode.from_level_order([2, 2, 2])}, "output": False},
        {"input": {"root": TreeNode.from_level_order([1])}, "output": True},
        {"input": {"root": TreeNode.from_level_order([5, 4, 6, None, None, 3, 7])}, "output": False},
    ],
}
