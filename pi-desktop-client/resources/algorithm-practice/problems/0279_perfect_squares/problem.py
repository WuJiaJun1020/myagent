PROBLEM = {
    "id": 279,
    "title": "完全平方数",
    "slug": "perfect_squares",
    "difficulty": "medium",
    "tags": ["广度优先搜索", "数学", "动态规划"],
    "description": "给你一个整数 n ，返回和为 n 的完全平方数的最少数量。\n\n完全平方数是一个整数，其值等于另一个整数的平方。例如，1、4、9 和 16 都是完全平方数，而 3 和 11 不是。",
    "examples": [
        {"input": {"n": 12}, "output": 3, "explanation": "12 = 4 + 4 + 4"},
        {"input": {"n": 13}, "output": 2, "explanation": "13 = 4 + 9"},
    ],
    "constraints": [
        "1 <= n <= 10^4",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "numSquares",
        "params": [("n", "int")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("n", "int")],
        "output_type": "int",
        "description": "输入一行整数 n。输出最少数量。",
    },
    "test_cases": [
        {"input": {"n": 12}, "output": 3},
        {"input": {"n": 13}, "output": 2},
        {"input": {"n": 1}, "output": 1},
        {"input": {"n": 4}, "output": 1},
        {"input": {"n": 5}, "output": 2},
    ],
}
