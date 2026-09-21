from core.types import TreeNode

PROBLEM = {
    "id": 114,
    "title": "二叉树展开为链表",
    "slug": "flatten_binary_tree_to_linked_list",
    "difficulty": "medium",
    "tags": ["栈", "树", "深度优先搜索", "链表"],
    "description": (
        "给你二叉树的根结点 root ，请你将它展开为一个单链表：\n"
        "- 展开后的单链表应该同样使用 TreeNode ，其中 right 子指针指向链表中下一个结点，而左子指针始终为 null 。\n"
        "- 展开后的单链表应该与二叉树先序遍历顺序相同。"
    ),
    "examples": [
        {"input": {"root": TreeNode.from_level_order([1, 2, 5, 3, 4, None, 6])},
         "output": TreeNode.from_level_order([1, None, 2, None, 3, None, 4, None, 5, None, 6])},
        {"input": {"root": TreeNode.from_level_order([])}, "output": TreeNode.from_level_order([])},
    ],
    "constraints": [
        "树中结点数在范围 [0, 2000] 内",
        "-100 <= Node.val <= 100",
    ],
    "follow_up": "你可以使用原地算法（O(1) 额外空间）展开这棵树吗？",
    "leetcode": {
        "class": "Solution",
        "method": "flatten",
        "params": [("root", "TreeNode")],
        "return": "None",
        "inplace": "root",
    },
    "acm": {
        "input_fields": [("root", "TreeNode")],
        "output_type": "TreeNode",
        "description": "输入一行层序遍历数组（空格分隔，null 表示空节点）。输出展开后树的层序遍历。",
    },
    "test_cases": [
        {"input": {"root": TreeNode.from_level_order([1, 2, 5, 3, 4, None, 6])},
         "output": TreeNode.from_level_order([1, None, 2, None, 3, None, 4, None, 5, None, 6])},
        {"input": {"root": TreeNode.from_level_order([])}, "output": TreeNode.from_level_order([])},
        {"input": {"root": TreeNode.from_level_order([0])}, "output": TreeNode.from_level_order([0])},
    ],
}
