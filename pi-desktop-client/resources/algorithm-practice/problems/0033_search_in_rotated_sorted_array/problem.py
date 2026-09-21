PROBLEM = {
    "id": 33,
    "title": "搜索旋转排序数组",
    "slug": "search_in_rotated_sorted_array",
    "difficulty": "medium",
    "tags": ["数组", "二分查找"],
    "description": (
        "整数数组 nums 按升序排列，数组中的值互不相同。在传递给函数之前，nums 在预先未知的某个下标 k 上进行了旋转。\n\n"
        "给你旋转后的数组 nums 和一个整数 target ，如果 nums 中存在这个目标值 target ，则返回它的下标，否则返回 -1 。\n\n"
        "你必须设计一个时间复杂度为 O(log n) 的算法解决此问题。"
    ),
    "examples": [
        {"input": {"nums": [4, 5, 6, 7, 0, 1, 2], "target": 0}, "output": 4},
        {"input": {"nums": [4, 5, 6, 7, 0, 1, 2], "target": 3}, "output": -1},
        {"input": {"nums": [1], "target": 0}, "output": -1},
    ],
    "constraints": [
        "1 <= nums.length <= 5000",
        "-10^4 <= nums[i] <= 10^4",
        "nums 中的每个值都独一无二",
        "-10^4 <= target <= 10^4",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "search",
        "params": [("nums", "List[int]"), ("target", "int")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("nums", "List[int]"), ("target", "int")],
        "output_type": "int",
        "description": "第一行：nums（空格分隔）；第二行：target。输出下标（不存在输出 -1）。",
    },
    "test_cases": [
        {"input": {"nums": [4, 5, 6, 7, 0, 1, 2], "target": 0}, "output": 4},
        {"input": {"nums": [4, 5, 6, 7, 0, 1, 2], "target": 3}, "output": -1},
        {"input": {"nums": [1], "target": 0}, "output": -1},
        {"input": {"nums": [3, 1], "target": 1}, "output": 1},
        {"input": {"nums": [1, 3], "target": 3}, "output": 1},
    ],
}
