def _check(actual, expected):
    def norm(x):
        return sorted(sorted(t) for t in x)
    return norm(actual) == norm(expected)


def _check_stdout(actual, expected):
    def norm(s):
        return sorted(tuple(sorted(line.split())) for line in s.splitlines())
    return norm(actual) == norm(expected)


PROBLEM = {
    "id": 78,
    "title": "子集",
    "slug": "subsets",
    "difficulty": "medium",
    "tags": ["位运算", "数组", "回溯"],
    "description": "给你一个整数数组 nums ，数组中的元素互不相同。返回该数组所有可能的子集（幂集）。\n\n解集不能包含重复的子集。你可以按任意顺序返回解集。",
    "examples": [
        {"input": {"nums": [1, 2, 3]}, "output": [[], [1], [2], [1, 2], [3], [1, 3], [2, 3], [1, 2, 3]]},
        {"input": {"nums": [0]}, "output": [[], [0]]},
    ],
    "constraints": [
        "1 <= nums.length <= 10",
        "-10 <= nums[i] <= 10",
        "nums 中的所有元素互不相同",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "subsets",
        "params": [("nums", "List[int]")],
        "return": "List[List[int]]",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "List[List[int]]",
        "description": "输入一行整数数组 nums（空格分隔）。输出每个子集一行（空子集为一行空，顺序任意）。",
    },
    "check": _check,
    "check_stdout": _check_stdout,
    "test_cases": [
        {"input": {"nums": [1, 2, 3]}, "output": [[], [1], [2], [1, 2], [3], [1, 3], [2, 3], [1, 2, 3]]},
        {"input": {"nums": [0]}, "output": [[], [0]]},
        {"input": {"nums": [1, 2]}, "output": [[], [1], [2], [1, 2]]},
    ],
}
