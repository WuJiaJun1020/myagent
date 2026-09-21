PROBLEM = {
    "id": 45,
    "title": "跳跃游戏 II",
    "slug": "jump_game_ii",
    "difficulty": "medium",
    "tags": ["贪心", "数组", "动态规划"],
    "description": "给定一个长度为 n 的 0 索引整数数组 nums。初始位置为 nums[0]。\n\n每个元素 nums[i] 表示从索引 i 向前跳转的最大长度。\n\n返回到达 nums[n - 1] 的最小跳跃次数。生成的测试用例可以到达 nums[n - 1]。",
    "examples": [
        {"input": {"nums": [2, 3, 1, 1, 4]}, "output": 2},
        {"input": {"nums": [2, 3, 0, 1, 4]}, "output": 2},
    ],
    "constraints": [
        "1 <= nums.length <= 10^4",
        "0 <= nums[i] <= 1000",
        "题目保证可以到达 nums[n-1]",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "jump",
        "params": [("nums", "List[int]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "int",
        "description": "输入一行整数数组 nums（空格分隔）。输出最小跳跃次数。",
    },
    "test_cases": [
        {"input": {"nums": [2, 3, 1, 1, 4]}, "output": 2},
        {"input": {"nums": [2, 3, 0, 1, 4]}, "output": 2},
        {"input": {"nums": [0]}, "output": 0},
        {"input": {"nums": [1, 2]}, "output": 1},
        {"input": {"nums": [2, 1]}, "output": 1},
    ],
}
