def _check(actual, expected):
    def norm(x):
        return sorted(sorted(t) for t in x)
    return norm(actual) == norm(expected)


def _check_stdout(actual, expected):
    def norm(s):
        return sorted(tuple(sorted(line.split())) for line in s.splitlines())
    return norm(actual) == norm(expected)


PROBLEM = {
    "id": 46,
    "title": "全排列",
    "slug": "permutations",
    "difficulty": "medium",
    "tags": ["数组", "回溯"],
    "description": "给定一个不含重复数字的数组 nums ，返回其所有可能的全排列。你可以按任意顺序返回答案。",
    "examples": [
        {"input": {"nums": [1, 2, 3]},
         "output": [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]},
        {"input": {"nums": [0, 1]}, "output": [[0, 1], [1, 0]]},
        {"input": {"nums": [1]}, "output": [[1]]},
    ],
    "constraints": [
        "1 <= nums.length <= 6",
        "-10 <= nums[i] <= 10",
        "nums 中的所有整数互不相同",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "permute",
        "params": [("nums", "List[int]")],
        "return": "List[List[int]]",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "List[List[int]]",
        "description": "输入一行整数数组 nums（空格分隔）。输出每个排列一行、组内空格分隔（顺序任意）。",
    },
    "check": _check,
    "check_stdout": _check_stdout,
    "test_cases": [
        {"input": {"nums": [1, 2, 3]},
         "output": [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]},
        {"input": {"nums": [0, 1]}, "output": [[0, 1], [1, 0]]},
        {"input": {"nums": [1]}, "output": [[1]]},
        {"input": {"nums": [1, 2]}, "output": [[1, 2], [2, 1]]},
    ],
}
