PROBLEM = {
    "id": 70,
    "title": "爬楼梯",
    "slug": "climbing_stairs",
    "difficulty": "easy",
    "tags": ["动态规划"],
    "description": (
        "假设你正在爬楼梯。需要 n 阶你才能到达楼顶。\n\n"
        "每次你可以爬 1 或 2 个台阶。你有多少种不同的方法可以爬到楼顶呢？"
    ),
    "examples": [
        {"input": {"n": 2}, "output": 2, "explanation": "有两种方法可以爬到楼顶。1. 1 阶 + 1 阶 2. 2 阶"},
        {"input": {"n": 3}, "output": 3,
         "explanation": "有三种方法可以爬到楼顶。1. 1 阶 + 1 阶 + 1 阶 2. 1 阶 + 2 阶 3. 2 阶 + 1 阶"},
    ],
    "constraints": [
        "1 <= n <= 45",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "climbStairs",
        "params": [("n", "int")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("n", "int")],
        "output_type": "int",
        "description": "输入一行整数 n。输出方法总数。",
    },
    "test_cases": [
        {"input": {"n": 2}, "output": 2},
        {"input": {"n": 3}, "output": 3},
        {"input": {"n": 1}, "output": 1},
        {"input": {"n": 4}, "output": 5},
        {"input": {"n": 45}, "output": 1836311903},
    ],
}
