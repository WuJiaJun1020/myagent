from core.types import TreeNode

PROBLEM = {
    "id": 94,
    "title": "二叉树的中序遍历",
    "slug": "binary_tree_inorder_traversal",
    "difficulty": "easy",
    "tags": ["树", "深度优先搜索"],
    "description": "给定一个二叉树的根节点 root ，返回它的 中序 遍历。",
    "examples": [
        {"input": {"root": TreeNode.from_level_order([1, None, 2, 3])}, "output": [1, 3, 2]},
        {"input": {"root": TreeNode.from_level_order([])}, "output": []},
        {"input": {"root": TreeNode.from_level_order([1])}, "output": [1]},
    ],
    "constraints": [
        "树中节点数目在范围 [0, 100] 内",
        "-100 <= Node.val <= 100",
    ],
    "follow_up": "递归算法很简单，你可以通过迭代算法完成吗？",
    "leetcode": {
        "class": "Solution",
        "method": "inorderTraversal",
        "params": [("root", "TreeNode")],
        "return": "List[int]",
    },
    "acm": {
        "input_fields": [("root", "TreeNode")],
        "output_type": "List[int]",
        "description": "输入一行层序遍历数组（空格分隔，null 表示空节点，整行 null 表示空树）。输出中序遍历结果（空格分隔）。",
    },
    "test_cases": [
        {"input": {"root": TreeNode.from_level_order([1, None, 2, 3])}, "output": [1, 3, 2]},
        {"input": {"root": TreeNode.from_level_order([])}, "output": []},
        {"input": {"root": TreeNode.from_level_order([1])}, "output": [1]},
        {"input": {"root": TreeNode.from_level_order([1, 2])}, "output": [2, 1]},
        {"input": {"root": TreeNode.from_level_order([1, None, 2])}, "output": [1, 2]},
    ],
}
