PROBLEM = {
    "id": 152,
    "title": "乘积最大子数组",
    "slug": "maximum_product_subarray",
    "difficulty": "medium",
    "tags": ["数组", "动态规划"],
    "description": "给你一个整数数组 nums ，请你找出数组中乘积最大的非空连续子数组（该子数组中至少包含一个数字），并返回该子数组所对应的乘积。\n\n测试用例的答案是一个 32-位 整数。",
    "examples": [
        {"input": {"nums": [2, 3, -2, 4]}, "output": 6},
        {"input": {"nums": [-2, 0, -1]}, "output": 0},
    ],
    "constraints": [
        "1 <= nums.length <= 2 * 10^4",
        "-10 <= nums[i] <= 10",
        "nums 的任何子数组的乘积都保证是一个 32-位 整数",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "maxProduct",
        "params": [("nums", "List[int]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "int",
        "description": "输入一行整数数组 nums（空格分隔）。输出最大乘积。",
    },
    "test_cases": [
        {"input": {"nums": [2, 3, -2, 4]}, "output": 6},
        {"input": {"nums": [-2, 0, -1]}, "output": 0},
        {"input": {"nums": [-2]}, "output": -2},
        {"input": {"nums": [0, 2]}, "output": 2},
        {"input": {"nums": [-2, 3, -4]}, "output": 24},
    ],
}
