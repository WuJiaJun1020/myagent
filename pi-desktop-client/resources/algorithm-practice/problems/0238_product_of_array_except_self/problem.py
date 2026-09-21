PROBLEM = {
    "id": 238,
    "title": "除自身以外数组的乘积",
    "slug": "product_of_array_except_self",
    "difficulty": "medium",
    "tags": ["数组", "前缀积"],
    "description": (
        "给你一个整数数组 nums，返回数组 answer ，其中 answer[i] 等于 nums 中除 nums[i] 之外其余各元素的乘积。\n\n"
        "题目数据保证数组 nums 之中任意元素的全部前缀元素和后缀的乘积都在 32 位整数范围内。\n\n"
        "请 不要使用除法，且在 O(n) 时间复杂度内完成此题。"
    ),
    "examples": [
        {"input": {"nums": [1, 2, 3, 4]}, "output": [24, 12, 8, 6]},
        {"input": {"nums": [-1, 1, 0, -3, 3]}, "output": [0, 0, 9, 0, 0]},
    ],
    "constraints": [
        "2 <= nums.length <= 10^5",
        "-30 <= nums[i] <= 30",
        "保证数组 nums 之中任意元素的全部前缀元素和后缀的乘积都在 32 位整数范围内",
    ],
    "follow_up": "你可以在 O(1) 的额外空间复杂度内完成这个题目吗？（输出数组不被视为额外空间。）",
    "leetcode": {
        "class": "Solution",
        "method": "productExceptSelf",
        "params": [("nums", "List[int]")],
        "return": "List[int]",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "List[int]",
        "description": "输入一行整数数组 nums（空格分隔）。输出结果数组（空格分隔）。",
    },
    "test_cases": [
        {"input": {"nums": [1, 2, 3, 4]}, "output": [24, 12, 8, 6]},
        {"input": {"nums": [-1, 1, 0, -3, 3]}, "output": [0, 0, 9, 0, 0]},
        {"input": {"nums": [2, 3]}, "output": [3, 2]},
        {"input": {"nums": [0, 0]}, "output": [0, 0]},
    ],
}
