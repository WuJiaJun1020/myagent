PROBLEM = {
    "id": 153,
    "title": "寻找旋转排序数组中的最小值",
    "slug": "find_minimum_in_rotated_sorted_array",
    "difficulty": "medium",
    "tags": ["数组", "二分查找"],
    "description": (
        "已知一个长度为 n 的数组，预先按照升序排列，经由 1 到 n 次旋转后，得到输入数组。\n\n"
        "给你一个元素值互不相同的数组 nums ，它原来是一个升序排列的数组，并按上述情形进行了多次旋转。请你找出并返回数组中的最小元素。\n\n"
        "你必须设计一个时间复杂度为 O(log n) 的算法解决此问题。"
    ),
    "examples": [
        {"input": {"nums": [3, 4, 5, 1, 2]}, "output": 1},
        {"input": {"nums": [4, 5, 6, 7, 0, 1, 2]}, "output": 0},
        {"input": {"nums": [11, 13, 15, 17]}, "output": 11},
    ],
    "constraints": [
        "n == nums.length",
        "1 <= n <= 5000",
        "-5000 <= nums[i] <= 5000",
        "nums 中的所有整数互不相同",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "findMin",
        "params": [("nums", "List[int]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "int",
        "description": "输入一行整数数组 nums（空格分隔）。输出最小值。",
    },
    "test_cases": [
        {"input": {"nums": [3, 4, 5, 1, 2]}, "output": 1},
        {"input": {"nums": [4, 5, 6, 7, 0, 1, 2]}, "output": 0},
        {"input": {"nums": [11, 13, 15, 17]}, "output": 11},
        {"input": {"nums": [1]}, "output": 1},
        {"input": {"nums": [2, 1]}, "output": 1},
    ],
}
