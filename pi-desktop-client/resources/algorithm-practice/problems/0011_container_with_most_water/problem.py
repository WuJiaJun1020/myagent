PROBLEM = {
    "id": 11,
    "title": "盛最多水的容器",
    "slug": "container_with_most_water",
    "difficulty": "medium",
    "tags": ["数组", "双指针"],
    "description": (
        "给定一个长度为 n 的整数数组 height 。有 n 条垂线，第 i 条线的两个端点是 (i, 0) 和 (i, height[i]) 。\n\n"
        "找出其中的两条线，使得它们与 x 轴共同构成的容器可以容纳最多的水。\n\n"
        "返回容器可以储存的最大水量。\n\n"
        "说明：你不能倾斜容器。"
    ),
    "examples": [
        {"input": {"height": [1, 8, 6, 2, 5, 4, 8, 3, 7]}, "output": 49,
         "explanation": "图中垂直线代表输入数组 [1,8,6,2,5,4,8,3,7]。在此情况下，容器能够容纳水的最大值为 49。"},
        {"input": {"height": [1, 1]}, "output": 1},
    ],
    "constraints": [
        "n == height.length",
        "2 <= n <= 10^5",
        "0 <= height[i] <= 10^4",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "maxArea",
        "params": [("height", "List[int]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("height", "List[int]")],
        "output_type": "int",
        "description": "输入一行整数数组 height（空格分隔）。输出最大盛水量。",
    },
    "test_cases": [
        {"input": {"height": [1, 8, 6, 2, 5, 4, 8, 3, 7]}, "output": 49},
        {"input": {"height": [1, 1]}, "output": 1},
        {"input": {"height": [4, 3, 2, 1, 4]}, "output": 16},
        {"input": {"height": [1, 2, 1]}, "output": 2},
        {"input": {"height": [2, 3, 4, 5, 18, 17, 6]}, "output": 17},
    ],
}
