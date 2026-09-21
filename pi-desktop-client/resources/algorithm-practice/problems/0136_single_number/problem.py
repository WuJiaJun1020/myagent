PROBLEM = {
    "id": 136,
    "title": "只出现一次的数字",
    "slug": "single_number",
    "difficulty": "easy",
    "tags": ["位运算", "数组"],
    "description": (
        "给你一个非空整数数组 nums ，除了某个元素只出现一次以外，其余每个元素均出现两次。"
        "找出那个只出现了一次的元素。\n\n"
        "你必须设计并实现线性时间复杂度的算法来解决此问题，且该算法只使用常量额外空间。"
    ),
    "examples": [
        {"input": {"nums": [2, 2, 1]}, "output": 1},
        {"input": {"nums": [4, 1, 2, 1, 2]}, "output": 4},
        {"input": {"nums": [1]}, "output": 1},
    ],
    "constraints": [
        "1 <= nums.length <= 3 * 10^4",
        "-3 * 10^4 <= nums[i] <= 3 * 10^4",
        "除了某个元素只出现一次以外，其余每个元素均出现两次",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "singleNumber",
        "params": [("nums", "List[int]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "int",
        "description": "输入一行整数数组 nums（空格分隔）。输出只出现一次的数字。",
    },
    "test_cases": [
        {"input": {"nums": [2, 2, 1]}, "output": 1},
        {"input": {"nums": [4, 1, 2, 1, 2]}, "output": 4},
        {"input": {"nums": [1]}, "output": 1},
        {"input": {"nums": [1, 0, 1]}, "output": 0},
        {"input": {"nums": [1, 1, 2, 2, 3]}, "output": 3},
    ],
}
