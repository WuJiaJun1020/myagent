PROBLEM = {
    "id": 739,
    "title": "每日温度",
    "slug": "daily_temperatures",
    "difficulty": "medium",
    "tags": ["栈", "数组", "单调栈"],
    "description": "给定一个整数数组 temperatures ，表示每天的温度，返回一个数组 answer ，其中 answer[i] 是指对于第 i 天，下一个更高温度出现在几天后。如果气温在这之后都不会升高，请在该位置用 0 来代替。",
    "examples": [
        {"input": {"temperatures": [73, 74, 75, 71, 69, 72, 76, 73]}, "output": [1, 1, 4, 2, 1, 1, 0, 0]},
        {"input": {"temperatures": [30, 40, 50, 60]}, "output": [1, 1, 1, 0]},
        {"input": {"temperatures": [30, 60, 90]}, "output": [1, 1, 0]},
    ],
    "constraints": [
        "1 <= temperatures.length <= 10^5",
        "30 <= temperatures[i] <= 100",
    ],
    "follow_up": "你想出 O(n) 时间复杂度的解法了吗？",
    "leetcode": {
        "class": "Solution",
        "method": "dailyTemperatures",
        "params": [("temperatures", "List[int]")],
        "return": "List[int]",
    },
    "acm": {
        "input_fields": [("temperatures", "List[int]")],
        "output_type": "List[int]",
        "description": "输入一行整数数组 temperatures（空格分隔）。输出结果数组（空格分隔）。",
    },
    "test_cases": [
        {"input": {"temperatures": [73, 74, 75, 71, 69, 72, 76, 73]}, "output": [1, 1, 4, 2, 1, 1, 0, 0]},
        {"input": {"temperatures": [30, 40, 50, 60]}, "output": [1, 1, 1, 0]},
        {"input": {"temperatures": [30, 60, 90]}, "output": [1, 1, 0]},
        {"input": {"temperatures": [30, 30, 30]}, "output": [0, 0, 0]},
        {"input": {"temperatures": [89, 62, 70, 58, 47, 47, 46, 76, 100, 70]}, "output": [8, 1, 5, 4, 3, 2, 1, 1, 0, 0]},
    ],
}
