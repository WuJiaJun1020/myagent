PROBLEM = {
    "id": 53,
    "title": "最大子数组和",
    "slug": "maximum_subarray",
    "difficulty": "medium",
    "tags": ["数组", "动态规划", "分治"],
    "description": (
        "给你一个整数数组 nums ，请你找出一个具有最大和的连续子数组（子数组最少包含一个元素），返回其最大和。\n\n"
        "子数组是数组中的一个连续部分。"
    ),
    "examples": [
        {"input": {"nums": [-2, 1, -3, 4, -1, 2, 1, -5, 4]}, "output": 6,
         "explanation": "连续子数组 [4,-1,2,1] 的和最大，为 6 。"},
        {"input": {"nums": [1]}, "output": 1},
        {"input": {"nums": [5, 4, -1, 7, 8]}, "output": 23},
    ],
    "constraints": [
        "1 <= nums.length <= 10^5",
        "-10^4 <= nums[i] <= 10^4",
    ],
    "follow_up": "如果你已经实现复杂度为 O(n) 的解法，尝试使用更为精妙的 分治法 求解。",
    "leetcode": {
        "class": "Solution",
        "method": "maxSubArray",
        "params": [("nums", "List[int]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "int",
        "description": "输入一行整数数组 nums（空格分隔）。输出最大子数组和。",
    },
    "test_cases": [
        {"input": {"nums": [-2, 1, -3, 4, -1, 2, 1, -5, 4]}, "output": 6},
        {"input": {"nums": [1]}, "output": 1},
        {"input": {"nums": [5, 4, -1, 7, 8]}, "output": 23},
        {"input": {"nums": [-1]}, "output": -1},
        {"input": {"nums": [-2, -1]}, "output": -1},
        {"input": {"nums": [1, 2, 3, 4, 5]}, "output": 15},
    ],
}
