def _check(actual, expected):
    # 答案顺序任意
    return sorted(actual) == sorted(expected)


def _check_stdout(actual, expected):
    return sorted(actual.split()) == sorted(expected.split())


PROBLEM = {
    "id": 1,
    "title": "两数之和",
    "slug": "two_sum",
    "difficulty": "easy",
    "tags": ["数组", "哈希表"],
    "description": (
        "给定一个整数数组 nums 和一个整数目标值 target，请你在该数组中找出和为目标值 target "
        "的那两个整数，并返回它们的数组下标。\n\n"
        "你可以假设每种输入只会对应一个答案，并且你不能使用两次相同的元素。\n\n"
        "你可以按任意顺序返回答案。"
    ),
    "examples": [
        {"input": {"nums": [2, 7, 11, 15], "target": 9}, "output": [0, 1],
         "explanation": "因为 nums[0] + nums[1] == 9 ，返回 [0, 1] 。"},
        {"input": {"nums": [3, 2, 4], "target": 6}, "output": [1, 2]},
        {"input": {"nums": [3, 3], "target": 6}, "output": [0, 1]},
    ],
    "constraints": [
        "2 <= nums.length <= 10^4",
        "-10^9 <= nums[i] <= 10^9",
        "-10^9 <= target <= 10^9",
        "只会存在一个有效答案",
    ],
    "follow_up": "你可以想出一个时间复杂度小于 O(n^2) 的算法吗？",
    "leetcode": {
        "class": "Solution",
        "method": "twoSum",
        "params": [("nums", "List[int]"), ("target", "int")],
        "return": "List[int]",
    },
    "acm": {
        "input_fields": [("nums", "List[int]"), ("target", "int")],
        "output_type": "List[int]",
        "description": "第一行：nums（空格分隔整数）；第二行：target。输出两个下标（空格分隔，顺序任意）。",
    },
    "check": _check,
    "check_stdout": _check_stdout,
    "test_cases": [
        {"input": {"nums": [2, 7, 11, 15], "target": 9}, "output": [0, 1]},
        {"input": {"nums": [3, 2, 4], "target": 6}, "output": [1, 2]},
        {"input": {"nums": [3, 3], "target": 6}, "output": [0, 1]},
        {"input": {"nums": [-1, -2, -3, -4, -5], "target": -8}, "output": [2, 4]},
        {"input": {"nums": [0, 4, 3, 0], "target": 0}, "output": [0, 3]},
        {"input": {"nums": [1, 5, 7, 9], "target": 16}, "output": [2, 3]},
    ],
}
