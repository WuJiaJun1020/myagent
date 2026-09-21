def _check(actual, expected):
    def norm(x):
        return sorted(sorted(t) for t in x)
    return norm(actual) == norm(expected)


def _check_stdout(actual, expected):
    def norm(s):
        return sorted(tuple(sorted(line.split())) for line in s.splitlines())
    return norm(actual) == norm(expected)


PROBLEM = {
    "id": 39,
    "title": "组合总和",
    "slug": "combination_sum",
    "difficulty": "medium",
    "tags": ["数组", "回溯"],
    "description": (
        "给你一个无重复元素的整数数组 candidates 和一个目标整数 target ，找出 candidates 中可以使数字和为目标数 target 的所有不同组合，"
        "并以列表形式返回。你可以按任意顺序返回这些组合。\n\n"
        "candidates 中的同一个数字可以无限制重复被选取。如果至少一个数字的被选数量不同，则两种组合是不同的。"
    ),
    "examples": [
        {"input": {"candidates": [2, 3, 6, 7], "target": 7}, "output": [[2, 2, 3], [7]]},
        {"input": {"candidates": [2, 3, 5], "target": 8}, "output": [[2, 2, 2, 2], [2, 3, 3], [3, 5]]},
        {"input": {"candidates": [2], "target": 1}, "output": []},
    ],
    "constraints": [
        "1 <= candidates.length <= 30",
        "2 <= candidates[i] <= 40",
        "candidates 的所有元素互不相同",
        "1 <= target <= 40",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "combinationSum",
        "params": [("candidates", "List[int]"), ("target", "int")],
        "return": "List[List[int]]",
    },
    "acm": {
        "input_fields": [("candidates", "List[int]"), ("target", "int")],
        "output_type": "List[List[int]]",
        "description": "第一行：candidates（空格分隔）；第二行：target。输出每个组合一行、组内空格分隔（顺序任意）。",
    },
    "check": _check,
    "check_stdout": _check_stdout,
    "test_cases": [
        {"input": {"candidates": [2, 3, 6, 7], "target": 7}, "output": [[2, 2, 3], [7]]},
        {"input": {"candidates": [2, 3, 5], "target": 8}, "output": [[2, 2, 2, 2], [2, 3, 3], [3, 5]]},
        {"input": {"candidates": [2], "target": 1}, "output": []},
    ],
}
