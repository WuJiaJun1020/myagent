PROBLEM = {
    "id": 239,
    "title": "滑动窗口最大值",
    "slug": "sliding_window_maximum",
    "difficulty": "hard",
    "tags": ["队列", "数组", "滑动窗口", "单调队列"],
    "description": "给你一个整数数组 nums，有一个大小为 k 的滑动窗口从数组的最左侧移动到数组的最右侧。你只可以看到在滑动窗口内的 k 个数字。滑动窗口每次只向右移动一位。\n\n返回滑动窗口中的最大值。",
    "examples": [
        {"input": {"nums": [1, 3, -1, -3, 5, 3, 6, 7], "k": 3}, "output": [3, 3, 5, 5, 6, 7]},
        {"input": {"nums": [1], "k": 1}, "output": [1]},
    ],
    "constraints": [
        "1 <= nums.length <= 10^5",
        "-10^4 <= nums[i] <= 10^4",
        "1 <= k <= nums.length",
    ],
    "follow_up": "你能在线性时间复杂度内解决此题吗？",
    "leetcode": {
        "class": "Solution",
        "method": "maxSlidingWindow",
        "params": [("nums", "List[int]"), ("k", "int")],
        "return": "List[int]",
    },
    "acm": {
        "input_fields": [("nums", "List[int]"), ("k", "int")],
        "output_type": "List[int]",
        "description": "第一行：nums（空格分隔）；第二行：k。输出每个窗口最大值（空格分隔）。",
    },
    "test_cases": [
        {"input": {"nums": [1, 3, -1, -3, 5, 3, 6, 7], "k": 3}, "output": [3, 3, 5, 5, 6, 7]},
        {"input": {"nums": [1], "k": 1}, "output": [1]},
        {"input": {"nums": [1, -1], "k": 1}, "output": [1, -1]},
        {"input": {"nums": [1, 3, 1, 2, 0, 5], "k": 3}, "output": [3, 3, 2, 5]},
    ],
}
