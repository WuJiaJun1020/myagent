PROBLEM = {
    "id": 283,
    "title": "移动零",
    "slug": "move_zeroes",
    "difficulty": "easy",
    "tags": ["数组", "双指针"],
    "description": (
        "给定一个数组 nums，编写一个函数将所有 0 移动到数组的末尾，同时保持非零元素的相对顺序。\n\n"
        "请注意，必须在不复制数组的情况下原地对数组进行操作。"
    ),
    "examples": [
        {"input": {"nums": [0, 1, 0, 3, 12]}, "output": [1, 3, 12, 0, 0]},
        {"input": {"nums": [0]}, "output": [0]},
    ],
    "constraints": [
        "1 <= nums.length <= 10^4",
        "-2^31 <= nums[i] <= 2^31 - 1",
    ],
    "follow_up": "你能尽量减少完成的操作次数吗？",
    "leetcode": {
        "class": "Solution",
        "method": "moveZeroes",
        "params": [("nums", "List[int]")],
        "return": "None",
        "inplace": "nums",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "List[int]",
        "description": "输入一行整数数组 nums（空格分隔）。输出移动零后的数组（空格分隔）。",
    },
    "test_cases": [
        {"input": {"nums": [0, 1, 0, 3, 12]}, "output": [1, 3, 12, 0, 0]},
        {"input": {"nums": [0]}, "output": [0]},
        {"input": {"nums": [0, 0, 1]}, "output": [1, 0, 0]},
        {"input": {"nums": [1, 2, 3]}, "output": [1, 2, 3]},
        {"input": {"nums": [0, 0, 0]}, "output": [0, 0, 0]},
    ],
}
