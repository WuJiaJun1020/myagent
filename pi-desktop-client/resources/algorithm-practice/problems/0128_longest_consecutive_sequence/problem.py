PROBLEM = {
    "id": 128,
    "title": "最长连续序列",
    "slug": "longest_consecutive_sequence",
    "difficulty": "medium",
    "tags": ["哈希表", "并查集"],
    "description": (
        "给定一个未排序的整数数组 nums ，找出数字连续的最长序列（不要求序列元素在原数组中连续）的长度。\n\n"
        "请你设计并实现时间复杂度为 O(n) 的算法解决此问题。"
    ),
    "examples": [
        {"input": {"nums": [100, 4, 200, 1, 3, 2]}, "output": 4,
         "explanation": "最长数字连续序列是 [1, 2, 3, 4]。它的长度为 4。"},
        {"input": {"nums": [0, 3, 7, 2, 5, 8, 4, 6, 0, 1]}, "output": 9},
    ],
    "constraints": [
        "0 <= nums.length <= 10^5",
        "-10^9 <= nums[i] <= 10^9",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "longestConsecutive",
        "params": [("nums", "List[int]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "int",
        "description": "输入一行整数数组 nums（空格分隔）。输出最长连续序列长度。",
    },
    "test_cases": [
        {"input": {"nums": [100, 4, 200, 1, 3, 2]}, "output": 4},
        {"input": {"nums": [0, 3, 7, 2, 5, 8, 4, 6, 0, 1]}, "output": 9},
        {"input": {"nums": []}, "output": 0},
        {"input": {"nums": [1]}, "output": 1},
        {"input": {"nums": [1, 2, 0, 1]}, "output": 3},
        {"input": {"nums": [9, 1, 4, 7, 3, -1, 0, 5, 8, -1, 6]}, "output": 7},
    ],
}
