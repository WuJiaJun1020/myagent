def _check(actual, expected):
    def inorder(node):
        return inorder(node.left) + [node.val] + inorder(node.right) if node else []

    def height(node):
        return 0 if not node else 1 + max(height(node.left), height(node.right))

    def balanced(node):
        if not node:
            return True
        return abs(height(node.left) - height(node.right)) <= 1 and balanced(node.left) and balanced(node.right)

    return inorder(actual) == expected and balanced(actual)


PROBLEM = {
    "id": 108,
    "title": "将有序数组转换为二叉搜索树",
    "slug": "convert_sorted_array_to_binary_search_tree",
    "difficulty": "easy",
    "tags": ["树", "二叉搜索树", "数组", "分治"],
    "description": "给你一个整数数组 nums ，其中元素已经按升序排列，请你将其转换为一棵平衡二叉搜索树。",
    "examples": [
        {"input": {"nums": [-10, -3, 0, 5, 9]}, "output": [-10, -3, 0, 5, 9],
         "explanation": "一个可能的结果是 [0,-3,9,-10,null,5]。"},
        {"input": {"nums": [1, 3]}, "output": [1, 3],
         "explanation": "结果是 [3,1] 或 [1,null,3]。"},
    ],
    "constraints": [
        "1 <= nums.length <= 10^4",
        "-10^4 <= nums[i] <= 10^4",
        "nums 按严格递增顺序排列",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "sortedArrayToBST",
        "params": [("nums", "List[int]")],
        "return": "TreeNode",
    },
    "check": _check,
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "List[int]",
        "description": "输入一行升序数组 nums（空格分隔）。输出中序遍历结果（空格分隔）。",
    },
    "test_cases": [
        {"input": {"nums": [-10, -3, 0, 5, 9]}, "output": [-10, -3, 0, 5, 9]},
        {"input": {"nums": [1, 3]}, "output": [1, 3]},
        {"input": {"nums": [1]}, "output": [1]},
    ],
}
