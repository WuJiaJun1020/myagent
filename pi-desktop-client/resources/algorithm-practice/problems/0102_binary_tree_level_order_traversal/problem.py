from core.types import TreeNode

PROBLEM = {
    "id": 102,
    "title": "二叉树的层序遍历",
    "slug": "binary_tree_level_order_traversal",
    "difficulty": "medium",
    "tags": ["树", "广度优先搜索"],
    "description": "给你二叉树的根节点 root ，返回其节点值的 层序遍历 。（即逐层地，从左到右访问所有节点）。",
    "examples": [
        {"input": {"root": TreeNode.from_level_order([3, 9, 20, None, None, 15, 7])},
         "output": [[3], [9, 20], [15, 7]]},
        {"input": {"root": TreeNode.from_level_order([1])}, "output": [[1]]},
        {"input": {"root": TreeNode.from_level_order([])}, "output": []},
    ],
    "constraints": [
        "树中节点数目在范围 [0, 2000] 内",
        "-1000 <= Node.val <= 1000",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "levelOrder",
        "params": [("root", "TreeNode")],
        "return": "List[List[int]]",
    },
    "acm": {
        "input_fields": [("root", "TreeNode")],
        "output_type": "List[List[int]]",
        "description": "输入一行层序遍历数组（空格分隔，null 表示空节点）。输出每层一行、层内空格分隔。",
    },
    "test_cases": [
        {"input": {"root": TreeNode.from_level_order([3, 9, 20, None, None, 15, 7])},
         "output": [[3], [9, 20], [15, 7]]},
        {"input": {"root": TreeNode.from_level_order([1])}, "output": [[1]]},
        {"input": {"root": TreeNode.from_level_order([])}, "output": []},
        {"input": {"root": TreeNode.from_level_order([1, 2, 3, 4, None, None, 5])},
         "output": [[1], [2, 3], [4, 5]]},
    ],
}
