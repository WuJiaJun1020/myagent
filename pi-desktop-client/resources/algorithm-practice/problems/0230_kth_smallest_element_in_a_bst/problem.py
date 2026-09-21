from core.types import TreeNode

PROBLEM = {
    "id": 230,
    "title": "二叉搜索树中第K小的元素",
    "slug": "kth_smallest_element_in_a_bst",
    "difficulty": "medium",
    "tags": ["树", "深度优先搜索", "二叉搜索树"],
    "description": "给定一个二叉搜索树的根节点 root ，和一个整数 k ，请你设计一个算法查找其中第 k 小的元素（从 1 开始计数）。",
    "examples": [
        {"input": {"root": TreeNode.from_level_order([3, 1, 4, None, 2]), "k": 1}, "output": 1},
        {"input": {"root": TreeNode.from_level_order([5, 3, 6, 2, 4, None, None, 1]), "k": 3}, "output": 3},
    ],
    "constraints": [
        "树中的节点数为 n",
        "1 <= k <= n <= 10^4",
        "0 <= Node.val <= 10^4",
    ],
    "follow_up": "如果二叉搜索树经常被修改（插入/删除操作）并且你需要频繁地查找第 k 小的值，你将如何优化算法？",
    "leetcode": {
        "class": "Solution",
        "method": "kthSmallest",
        "params": [("root", "TreeNode"), ("k", "int")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("root", "TreeNode"), ("k", "int")],
        "output_type": "int",
        "description": "第一行：层序遍历数组（空格分隔，null 表示空节点）；第二行：k。输出第 k 小的元素。",
    },
    "test_cases": [
        {"input": {"root": TreeNode.from_level_order([3, 1, 4, None, 2]), "k": 1}, "output": 1},
        {"input": {"root": TreeNode.from_level_order([5, 3, 6, 2, 4, None, None, 1]), "k": 3}, "output": 3},
        {"input": {"root": TreeNode.from_level_order([1]), "k": 1}, "output": 1},
    ],
}
