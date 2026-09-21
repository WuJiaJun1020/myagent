PROBLEM = {
    "id": 198,
    "title": "打家劫舍",
    "slug": "house_robber",
    "difficulty": "medium",
    "tags": ["数组", "动态规划"],
    "description": (
        "你是一个专业的小偷，计划偷窃沿街的房屋。每间房内都藏有一定的现金，影响你偷窃的唯一制约因素"
        "就是相邻的房屋装有相互连通的防盗系统，如果两间相邻的房屋在同一晚上被小偷闯入，系统会自动报警。\n\n"
        "给定一个代表每个房屋存放金额的非负整数数组，计算你 不触动警报装置的情况下，一夜之内能够偷窃到的最高金额。"
    ),
    "examples": [
        {"input": {"nums": [1, 2, 3, 1]}, "output": 4,
         "explanation": "偷窃 1 号房屋 (金额 = 1) ，然后偷窃 3 号房屋 (金额 = 3)。偷窃到的最高金额 = 1 + 3 = 4。"},
        {"input": {"nums": [2, 7, 9, 3, 1]}, "output": 12,
         "explanation": "偷窃 1 号房屋 (金额 = 2), 偷窃 3 号房屋 (金额 = 9)，接着偷窃 5 号房屋 (金额 = 1)。偷窃到的最高金额 = 2 + 9 + 1 = 12。"},
    ],
    "constraints": [
        "1 <= nums.length <= 100",
        "0 <= nums[i] <= 400",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "rob",
        "params": [("nums", "List[int]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "int",
        "description": "输入一行整数数组 nums（空格分隔）。输出最大金额。",
    },
    "test_cases": [
        {"input": {"nums": [1, 2, 3, 1]}, "output": 4},
        {"input": {"nums": [2, 7, 9, 3, 1]}, "output": 12},
        {"input": {"nums": [2, 1, 1, 2]}, "output": 4},
        {"input": {"nums": [0]}, "output": 0},
        {"input": {"nums": [5]}, "output": 5},
    ],
}
