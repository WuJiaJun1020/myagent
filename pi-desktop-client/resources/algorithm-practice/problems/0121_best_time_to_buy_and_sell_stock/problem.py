PROBLEM = {
    "id": 121,
    "title": "买卖股票的最佳时机",
    "slug": "best_time_to_buy_and_sell_stock",
    "difficulty": "easy",
    "tags": ["数组", "动态规划"],
    "description": (
        "给定一个数组 prices ，它的第 i 个元素 prices[i] 表示一支给定股票第 i 天的价格。\n\n"
        "你只能选择某一天买入这只股票，并选择在未来的某一个不同的日子卖出该股票。设计一个算法来计算你所能获取的最大利润。\n\n"
        "返回你可以从这笔交易中获取的最大利润。如果你不能获取任何利润，返回 0 。"
    ),
    "examples": [
        {"input": {"prices": [7, 1, 5, 3, 6, 4]}, "output": 5,
         "explanation": "在第 2 天（价格 = 1）买入，在第 5 天（价格 = 6）卖出，利润 = 6 - 1 = 5。"},
        {"input": {"prices": [7, 6, 4, 3, 1]}, "output": 0,
         "explanation": "在这种情况下, 没有交易完成, 所以最大利润为 0。"},
    ],
    "constraints": [
        "1 <= prices.length <= 10^5",
        "0 <= prices[i] <= 10^4",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "maxProfit",
        "params": [("prices", "List[int]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("prices", "List[int]")],
        "output_type": "int",
        "description": "输入一行整数数组 prices（空格分隔）。输出最大利润。",
    },
    "test_cases": [
        {"input": {"prices": [7, 1, 5, 3, 6, 4]}, "output": 5},
        {"input": {"prices": [7, 6, 4, 3, 1]}, "output": 0},
        {"input": {"prices": [1, 2]}, "output": 1},
        {"input": {"prices": [2, 1]}, "output": 0},
        {"input": {"prices": [1]}, "output": 0},
        {"input": {"prices": [3, 3, 5, 0, 0, 3, 1, 4]}, "output": 4},
    ],
}
