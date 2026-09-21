PROBLEM = {
    "id": 322,
    "title": "零钱兑换",
    "slug": "coin_change",
    "difficulty": "medium",
    "tags": ["广度优先搜索", "数组", "动态规划"],
    "description": "给你一个整数数组 coins ，表示不同面额的硬币；以及一个整数 amount ，表示总金额。\n\n计算并返回可以凑成总金额所需的最少的硬币个数。如果没有任何一种硬币组合能组成总金额，返回 -1 。\n\n你可以认为每种硬币的数量是无限的。",
    "examples": [
        {"input": {"coins": [1, 2, 5], "amount": 11}, "output": 3, "explanation": "11 = 5 + 5 + 1"},
        {"input": {"coins": [2], "amount": 3}, "output": -1},
        {"input": {"coins": [1], "amount": 0}, "output": 0},
    ],
    "constraints": [
        "1 <= coins.length <= 12",
        "1 <= coins[i] <= 2^31 - 1",
        "0 <= amount <= 10^4",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "coinChange",
        "params": [("coins", "List[int]"), ("amount", "int")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("coins", "List[int]"), ("amount", "int")],
        "output_type": "int",
        "description": "第一行：coins（空格分隔）；第二行：amount。输出最少硬币数（无法凑出输出 -1）。",
    },
    "test_cases": [
        {"input": {"coins": [1, 2, 5], "amount": 11}, "output": 3},
        {"input": {"coins": [2], "amount": 3}, "output": -1},
        {"input": {"coins": [1], "amount": 0}, "output": 0},
        {"input": {"coins": [1], "amount": 2}, "output": 2},
    ],
}
