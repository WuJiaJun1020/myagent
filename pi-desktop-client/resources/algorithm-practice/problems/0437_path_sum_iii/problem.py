from core.types import TreeNode

PROBLEM = {
    "id": 437,
    "title": "路径总和 III",
    "slug": "path_sum_iii",
    "difficulty": "medium",
    "tags": ["树", "深度优先搜索", "前缀和"],
    "description": "给定一个二叉树的根节点 root ，和一个整数 targetSum ，求该二叉树里节点值之和等于 targetSum 的路径的数目。\n\n路径不需要从根节点开始，也不需要在叶子节点结束，但是路径方向必须是向下的（只能从父节点到子节点）。",
    "examples": [
        {"input": {"root": TreeNode.from_level_order([10, 5, -3, 3, 2, None, 11, 3, -2, None, 1]), "targetSum": 8}, "output": 3},
        {"input": {"root": TreeNode.from_level_order([5, 4, 8, 11, None, 13, 4, 7, 2, None, None, 5, 1]), "targetSum": 22}, "output": 3},
    ],
    "constraints": [
        "二叉树的节点个数的范围是 [0,1000]",
        "-10^9 <= Node.val <= 10^9",
        "-1000 <= targetSum <= 1000",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "pathSum",
        "params": [("root", "TreeNode"), ("targetSum", "int")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("root", "TreeNode"), ("targetSum", "int")],
        "output_type": "int",
        "description": "第一行：层序遍历数组（空格分隔，null 表示空节点）；第二行：targetSum。输出路径数目。",
    },
    "test_cases": [
        {"input": {"root": TreeNode.from_level_order([10, 5, -3, 3, 2, None, 11, 3, -2, None, 1]), "targetSum": 8}, "output": 3},
        {"input": {"root": TreeNode.from_level_order([5, 4, 8, 11, None, 13, 4, 7, 2, None, None, 5, 1]), "targetSum": 22}, "output": 3},
        {"input": {"root": TreeNode.from_level_order([1]), "targetSum": 1}, "output": 1},
    ],
}
