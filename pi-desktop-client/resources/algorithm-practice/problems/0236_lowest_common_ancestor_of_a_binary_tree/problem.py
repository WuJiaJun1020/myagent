from core.types import TreeNode


def _build_input(inp):
    root = inp["root"]

    def find(node, val):
        if not node:
            return None
        if node.val == val:
            return node
        return find(node.left, val) or find(node.right, val)

    return {"root": root, "p": find(root, inp["p"]), "q": find(root, inp["q"])}


def _resolve(actual, inp_copy):
    return actual.val if actual else None


PROBLEM = {
    "id": 236,
    "title": "二叉树的最近公共祖先",
    "slug": "lowest_common_ancestor_of_a_binary_tree",
    "difficulty": "medium",
    "tags": ["树", "深度优先搜索"],
    "description": "给定一个二叉树, 找到该树中两个指定节点的最近公共祖先。\n\n最近公共祖先的定义为：对于有根树 T 的两个节点 p、q，最近公共祖先表示为一个节点 x，满足 x 是 p、q 的祖先且 x 的深度尽可能大（一个节点也可以是它自己的祖先）。",
    "examples": [
        {"input": {"root": TreeNode.from_level_order([3, 5, 1, 6, 2, 0, 8, None, None, 7, 4]), "p": 5, "q": 1}, "output": 3},
        {"input": {"root": TreeNode.from_level_order([3, 5, 1, 6, 2, 0, 8, None, None, 7, 4]), "p": 5, "q": 4}, "output": 5},
    ],
    "constraints": [
        "树中节点数目在范围 [2, 10^5] 内",
        "-10^9 <= Node.val <= 10^9",
        "所有 Node.val 互不相同",
        "p != q",
        "p 和 q 均存在于给定的二叉树中",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "lowestCommonAncestor",
        "params": [("root", "TreeNode"), ("p", "TreeNode"), ("q", "TreeNode")],
        "return": "TreeNode",
    },
    "build_input": _build_input,
    "resolve_answer": _resolve,
    "acm": {
        "input_fields": [("root", "TreeNode"), ("p", "int"), ("q", "int")],
        "output_type": "int",
        "description": "第一行：层序遍历数组（空格分隔，null 表示空节点）；第二行：p；第三行：q。输出最近公共祖先节点的值。",
    },
    "test_cases": [
        {"input": {"root": TreeNode.from_level_order([3, 5, 1, 6, 2, 0, 8, None, None, 7, 4]), "p": 5, "q": 1}, "output": 3},
        {"input": {"root": TreeNode.from_level_order([3, 5, 1, 6, 2, 0, 8, None, None, 7, 4]), "p": 5, "q": 4}, "output": 5},
        {"input": {"root": TreeNode.from_level_order([1, 2]), "p": 1, "q": 2}, "output": 1},
    ],
}
