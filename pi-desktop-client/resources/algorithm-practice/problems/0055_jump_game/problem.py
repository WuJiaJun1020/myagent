PROBLEM = {
    "id": 55,
    "title": "跳跃游戏",
    "slug": "jump_game",
    "difficulty": "medium",
    "tags": ["贪心", "数组", "动态规划"],
    "description": "给你一个非负整数数组 nums ，你最初位于数组的第一个下标。数组中的每个元素代表你在该位置可以跳跃的最大长度。\n\n判断你是否能够到达最后一个下标，如果可以，返回 true ；否则，返回 false 。",
    "examples": [
        {"input": {"nums": [2, 3, 1, 1, 4]}, "output": True},
        {"input": {"nums": [3, 2, 1, 0, 4]}, "output": False},
    ],
    "constraints": [
        "1 <= nums.length <= 10^4",
        "0 <= nums[i] <= 10^5",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "canJump",
        "params": [("nums", "List[int]")],
        "return": "bool",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "bool",
        "description": "输入一行整数数组 nums（空格分隔）。输出 true 或 false（小写）。",
    },
    "test_cases": [
        {"input": {"nums": [2, 3, 1, 1, 4]}, "output": True},
        {"input": {"nums": [3, 2, 1, 0, 4]}, "output": False},
        {"input": {"nums": [0]}, "output": True},
        {"input": {"nums": [2, 0, 0]}, "output": True},
        {"input": {"nums": [0, 2, 3]}, "output": False},
    ],
}
