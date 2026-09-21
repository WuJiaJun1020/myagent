PROBLEM = {
    "id": 560,
    "title": "和为 K 的子数组",
    "slug": "subarray_sum_equals_k",
    "difficulty": "medium",
    "tags": ["数组", "哈希表", "前缀和"],
    "description": (
        "给你一个整数数组 nums 和一个整数 k ，请你统计并返回该数组中和为 k 的子数组的个数。\n\n"
        "子数组是数组中元素的连续非空序列。"
    ),
    "examples": [
        {"input": {"nums": [1, 1, 1], "k": 2}, "output": 2},
        {"input": {"nums": [1, 2, 3], "k": 3}, "output": 2},
    ],
    "constraints": [
        "1 <= nums.length <= 2 * 10^4",
        "-1000 <= nums[i] <= 1000",
        "-10^7 <= k <= 10^7",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "subarraySum",
        "params": [("nums", "List[int]"), ("k", "int")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("nums", "List[int]"), ("k", "int")],
        "output_type": "int",
        "description": "第一行：整数数组 nums（空格分隔）；第二行：k。输出和为 k 的子数组个数。",
    },
    "test_cases": [
        {"input": {"nums": [1, 1, 1], "k": 2}, "output": 2},
        {"input": {"nums": [1, 2, 3], "k": 3}, "output": 2},
        {"input": {"nums": [1], "k": 0}, "output": 0},
        {"input": {"nums": [1, -1, 0], "k": 0}, "output": 3},
        {"input": {"nums": [-1, -1, 1], "k": 0}, "output": 1},
    ],
}
