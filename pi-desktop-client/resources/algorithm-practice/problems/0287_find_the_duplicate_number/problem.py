PROBLEM = {
    "id": 287,
    "title": "寻找重复数",
    "slug": "find_the_duplicate_number",
    "difficulty": "medium",
    "tags": ["位运算", "数组", "双指针", "二分查找"],
    "description": "给定一个包含 n + 1 个整数的数组 nums ，其数字都在 [1, n] 范围内（包括 1 和 n），可知至少存在一个重复的整数。\n\n假设 nums 只有一个重复的整数，返回这个重复的数。\n\n你设计的解决方案必须不修改数组 nums 且只用常量级 O(1) 的额外空间。",
    "examples": [
        {"input": {"nums": [1, 3, 4, 2, 2]}, "output": 2},
        {"input": {"nums": [3, 1, 3, 4, 2]}, "output": 3},
        {"input": {"nums": [3, 3, 3, 3, 3]}, "output": 3},
    ],
    "constraints": [
        "1 <= n <= 10^5",
        "nums.length == n + 1",
        "1 <= nums[i] <= n",
        "nums 中只有一个整数出现两次或多次，其余整数均只出现一次",
    ],
    "follow_up": "你可以设计一个线性级时间复杂度 O(n) 的解决方案吗？",
    "leetcode": {
        "class": "Solution",
        "method": "findDuplicate",
        "params": [("nums", "List[int]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "int",
        "description": "输入一行整数数组 nums（空格分隔）。输出重复的数。",
    },
    "test_cases": [
        {"input": {"nums": [1, 3, 4, 2, 2]}, "output": 2},
        {"input": {"nums": [3, 1, 3, 4, 2]}, "output": 3},
        {"input": {"nums": [3, 3, 3, 3, 3]}, "output": 3},
        {"input": {"nums": [1, 1]}, "output": 1},
    ],
}
