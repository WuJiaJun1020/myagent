PROBLEM = {
    "id": 62,
    "title": "不同路径",
    "slug": "unique_paths",
    "difficulty": "medium",
    "tags": ["数学", "动态规划", "组合数学"],
    "description": (
        "一个机器人位于一个 m x n 网格的左上角。\n\n"
        "机器人每次只能向下或者向右移动一步。机器人试图达到网格的右下角。\n\n"
        "问总共有多少条不同的路径？"
    ),
    "examples": [
        {"input": {"m": 3, "n": 7}, "output": 28},
        {"input": {"m": 3, "n": 2}, "output": 3},
    ],
    "constraints": [
        "1 <= m, n <= 100",
        "题目数据保证答案小于等于 2 * 10^9",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "uniquePaths",
        "params": [("m", "int"), ("n", "int")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("m", "int"), ("n", "int")],
        "output_type": "int",
        "description": "第一行：m；第二行：n。输出不同路径数。",
    },
    "test_cases": [
        {"input": {"m": 3, "n": 7}, "output": 28},
        {"input": {"m": 3, "n": 2}, "output": 3},
        {"input": {"m": 3, "n": 3}, "output": 6},
        {"input": {"m": 2, "n": 2}, "output": 2},
        {"input": {"m": 1, "n": 1}, "output": 1},
    ],
}
