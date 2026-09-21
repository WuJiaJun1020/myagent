PROBLEM = {
    "id": 300,
    "title": "最长递增子序列",
    "slug": "longest_increasing_subsequence",
    "difficulty": "medium",
    "tags": ["数组", "动态规划", "二分查找"],
    "description": (
        "给你一个整数数组 nums ，找到其中最长严格递增子序列的长度。\n\n"
        "子序列 是由数组派生而来的序列，删除（或不删除）数组中的元素而不改变其余元素的顺序。"
        "例如，[3,6,2,7] 是数组 [0,3,1,6,2,2,7] 的子序列。"
    ),
    "examples": [
        {"input": {"nums": [10, 9, 2, 5, 3, 7, 101, 18]}, "output": 4,
         "explanation": "最长递增子序列是 [2,3,7,101]，因此长度为 4 。"},
        {"input": {"nums": [0, 1, 0, 3, 2, 3]}, "output": 4},
        {"input": {"nums": [7, 7, 7, 7, 7, 7, 7]}, "output": 1},
    ],
    "constraints": [
        "1 <= nums.length <= 2500",
        "-10^4 <= nums[i] <= 10^4",
    ],
    "follow_up": "你能将算法的时间复杂度降低到 O(n log(n)) 吗?",
    "leetcode": {
        "class": "Solution",
        "method": "lengthOfLIS",
        "params": [("nums", "List[int]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "int",
        "description": "输入一行整数数组 nums（空格分隔）。输出最长递增子序列长度。",
    },
    "test_cases": [
        {"input": {"nums": [10, 9, 2, 5, 3, 7, 101, 18]}, "output": 4},
        {"input": {"nums": [0, 1, 0, 3, 2, 3]}, "output": 4},
        {"input": {"nums": [7, 7, 7, 7, 7, 7, 7]}, "output": 1},
        {"input": {"nums": [1]}, "output": 1},
        {"input": {"nums": [4, 10, 4, 3, 8, 9]}, "output": 3},
    ],
}
