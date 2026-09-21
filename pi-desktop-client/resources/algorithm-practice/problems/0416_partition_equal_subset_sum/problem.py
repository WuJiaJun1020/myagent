PROBLEM = {
    "id": 416,
    "title": "分割等和子集",
    "slug": "partition_equal_subset_sum",
    "difficulty": "medium",
    "tags": ["数组", "动态规划"],
    "description": "给你一个只包含正整数的非空数组 nums 。请你判断是否可以将这个数组分割成两个子集，使得两个子集的元素和相等。",
    "examples": [
        {"input": {"nums": [1, 5, 11, 5]}, "output": True, "explanation": "数组可以分割成 [1, 5, 5] 和 [11] 。"},
        {"input": {"nums": [1, 2, 3, 5]}, "output": False},
    ],
    "constraints": [
        "1 <= nums.length <= 200",
        "1 <= nums[i] <= 100",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "canPartition",
        "params": [("nums", "List[int]")],
        "return": "bool",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "bool",
        "description": "输入一行整数数组 nums（空格分隔）。输出 true 或 false（小写）。",
    },
    "test_cases": [
        {"input": {"nums": [1, 5, 11, 5]}, "output": True},
        {"input": {"nums": [1, 2, 3, 5]}, "output": False},
        {"input": {"nums": [1]}, "output": False},
        {"input": {"nums": [1, 2, 3, 4, 5, 6, 7]}, "output": True},
    ],
}
