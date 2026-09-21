PROBLEM = {
    "id": 189,
    "title": "轮转数组",
    "slug": "rotate_array",
    "difficulty": "medium",
    "tags": ["数组", "数学", "双指针"],
    "description": "给定一个整数数组 nums，将数组中的元素向右轮转 k 个位置，其中 k 是非负数。",
    "examples": [
        {"input": {"nums": [1, 2, 3, 4, 5, 6, 7], "k": 3}, "output": [5, 6, 7, 1, 2, 3, 4]},
        {"input": {"nums": [-1, -100, 3, 99], "k": 2}, "output": [3, 99, -1, -100]},
    ],
    "constraints": [
        "1 <= nums.length <= 10^5",
        "-2^31 <= nums[i] <= 2^31 - 1",
        "0 <= k <= 10^5",
    ],
    "follow_up": "尽可能想出更多的解决方案，至少有三种不同的方法可以解决这个问题。你可以使用空间复杂度为 O(1) 的原地算法解决这个问题吗？",
    "leetcode": {
        "class": "Solution",
        "method": "rotate",
        "params": [("nums", "List[int]"), ("k", "int")],
        "return": "None",
        "inplace": "nums",
    },
    "acm": {
        "input_fields": [("nums", "List[int]"), ("k", "int")],
        "output_type": "List[int]",
        "description": "第一行：整数数组 nums（空格分隔）；第二行：k。输出轮转后的数组（空格分隔）。",
    },
    "test_cases": [
        {"input": {"nums": [1, 2, 3, 4, 5, 6, 7], "k": 3}, "output": [5, 6, 7, 1, 2, 3, 4]},
        {"input": {"nums": [-1, -100, 3, 99], "k": 2}, "output": [3, 99, -1, -100]},
        {"input": {"nums": [1, 2, 3, 4, 5, 6, 7], "k": 0}, "output": [1, 2, 3, 4, 5, 6, 7]},
        {"input": {"nums": [1, 2], "k": 3}, "output": [2, 1]},
        {"input": {"nums": [1], "k": 0}, "output": [1]},
    ],
}
