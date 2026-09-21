PROBLEM = {
    "id": 41,
    "title": "缺失的第一个正数",
    "slug": "first_missing_positive",
    "difficulty": "hard",
    "tags": ["数组", "哈希表"],
    "description": "给你一个未排序的整数数组 nums ，请你找出其中没有出现的最小的正整数。\n\n请你实现时间复杂度为 O(n) 并且只使用常数级别额外空间的解决方案。",
    "examples": [
        {"input": {"nums": [1, 2, 0]}, "output": 3},
        {"input": {"nums": [3, 4, -1, 1]}, "output": 2},
        {"input": {"nums": [7, 8, 9, 11, 12]}, "output": 1},
    ],
    "constraints": [
        "1 <= nums.length <= 10^5",
        "-2^31 <= nums[i] <= 2^31 - 1",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "firstMissingPositive",
        "params": [("nums", "List[int]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "int",
        "description": "输入一行整数数组 nums（空格分隔）。输出缺失的最小正整数。",
    },
    "test_cases": [
        {"input": {"nums": [1, 2, 0]}, "output": 3},
        {"input": {"nums": [3, 4, -1, 1]}, "output": 2},
        {"input": {"nums": [7, 8, 9, 11, 12]}, "output": 1},
        {"input": {"nums": [1]}, "output": 2},
        {"input": {"nums": [1, 2, 3]}, "output": 4},
    ],
}
