PROBLEM = {
    "id": 42,
    "title": "接雨水",
    "slug": "trapping_rain_water",
    "difficulty": "hard",
    "tags": ["栈", "数组", "双指针", "动态规划", "单调栈"],
    "description": "给定 n 个非负整数表示每个宽度为 1 的柱子的高度图，计算按此排列的柱子，下雨之后能接多少雨水。",
    "examples": [
        {"input": {"height": [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]}, "output": 6},
        {"input": {"height": [4, 2, 0, 3, 2, 5]}, "output": 9},
    ],
    "constraints": [
        "n == height.length",
        "1 <= n <= 2 * 10^4",
        "0 <= height[i] <= 10^5",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "trap",
        "params": [("height", "List[int]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("height", "List[int]")],
        "output_type": "int",
        "description": "输入一行整数数组 height（空格分隔）。输出接雨水量。",
    },
    "test_cases": [
        {"input": {"height": [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]}, "output": 6},
        {"input": {"height": [4, 2, 0, 3, 2, 5]}, "output": 9},
        {"input": {"height": [1]}, "output": 0},
        {"input": {"height": [2, 0, 2]}, "output": 2},
    ],
}
