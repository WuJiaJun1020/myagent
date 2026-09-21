PROBLEM = {
    "id": 34,
    "title": "在排序数组中查找元素的第一个和最后一个位置",
    "slug": "find_first_and_last_position_of_element_in_sorted_array",
    "difficulty": "medium",
    "tags": ["数组", "二分查找"],
    "description": (
        "给你一个按照非递减顺序排列的整数数组 nums，和一个目标值 target。请你找出给定目标值在数组中的开始位置和结束位置。\n\n"
        "如果数组中不存在目标值 target，返回 [-1, -1]。\n\n"
        "你必须设计并实现时间复杂度为 O(log n) 的算法解决此问题。"
    ),
    "examples": [
        {"input": {"nums": [5, 7, 7, 8, 8, 10], "target": 8}, "output": [3, 4]},
        {"input": {"nums": [5, 7, 7, 8, 8, 10], "target": 6}, "output": [-1, -1]},
        {"input": {"nums": [], "target": 0}, "output": [-1, -1]},
    ],
    "constraints": [
        "0 <= nums.length <= 10^5",
        "-10^9 <= nums[i] <= 10^9",
        "nums 是一个非递减数组",
        "-10^9 <= target <= 10^9",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "searchRange",
        "params": [("nums", "List[int]"), ("target", "int")],
        "return": "List[int]",
    },
    "acm": {
        "input_fields": [("nums", "List[int]"), ("target", "int")],
        "output_type": "List[int]",
        "description": "第一行：nums（空格分隔，可为空）；第二行：target。输出 [开始, 结束]（空格分隔）。",
    },
    "test_cases": [
        {"input": {"nums": [5, 7, 7, 8, 8, 10], "target": 8}, "output": [3, 4]},
        {"input": {"nums": [5, 7, 7, 8, 8, 10], "target": 6}, "output": [-1, -1]},
        {"input": {"nums": [], "target": 0}, "output": [-1, -1]},
        {"input": {"nums": [1], "target": 1}, "output": [0, 0]},
        {"input": {"nums": [2, 2], "target": 2}, "output": [0, 1]},
    ],
}
