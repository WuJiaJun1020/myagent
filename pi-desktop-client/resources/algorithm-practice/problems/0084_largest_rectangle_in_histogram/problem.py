PROBLEM = {
    "id": 84,
    "title": "柱状图中最大的矩形",
    "slug": "largest_rectangle_in_histogram",
    "difficulty": "hard",
    "tags": ["栈", "数组", "单调栈"],
    "description": "给定 n 个非负整数，用来表示柱状图中各个柱子的高度。每个柱子彼此相邻，且宽度为 1 。求在该柱状图中，能够勾勒出来的矩形的最大面积。",
    "examples": [
        {"input": {"heights": [2, 1, 5, 6, 2, 3]}, "output": 10},
        {"input": {"heights": [2, 4]}, "output": 4},
    ],
    "constraints": [
        "1 <= heights.length <= 10^5",
        "0 <= heights[i] <= 10^4",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "largestRectangleArea",
        "params": [("heights", "List[int]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("heights", "List[int]")],
        "output_type": "int",
        "description": "输入一行整数数组 heights（空格分隔）。输出最大矩形面积。",
    },
    "test_cases": [
        {"input": {"heights": [2, 1, 5, 6, 2, 3]}, "output": 10},
        {"input": {"heights": [2, 4]}, "output": 4},
        {"input": {"heights": [1]}, "output": 1},
        {"input": {"heights": [0]}, "output": 0},
        {"input": {"heights": [2, 1, 2]}, "output": 3},
    ],
}
