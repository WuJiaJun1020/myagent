def _check(actual, expected):
    # 分割方案顺序任意，但每个方案内部顺序固定
    return sorted(actual) == sorted(expected)


def _check_stdout(actual, expected):
    return sorted(actual.splitlines()) == sorted(expected.splitlines())


PROBLEM = {
    "id": 131,
    "title": "分割回文串",
    "slug": "palindrome_partitioning",
    "difficulty": "medium",
    "tags": ["字符串", "动态规划", "回溯"],
    "description": "给你一个字符串 s，请你将 s 分割成一些子串，使每个子串都是回文串。返回 s 所有可能的分割方案。",
    "examples": [
        {"input": {"s": "aab"}, "output": [["a", "a", "b"], ["aa", "b"]]},
        {"input": {"s": "a"}, "output": [["a"]]},
    ],
    "constraints": [
        "1 <= s.length <= 16",
        "s 仅由小写英文字母组成",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "partition",
        "params": [("s", "str")],
        "return": "List[List[str]]",
    },
    "acm": {
        "input_fields": [("s", "str")],
        "output_type": "List[List[str]]",
        "description": "输入一行字符串 s。输出每个分割方案一行（组内空格分隔，顺序任意）。",
    },
    "check": _check,
    "check_stdout": _check_stdout,
    "test_cases": [
        {"input": {"s": "aab"}, "output": [["a", "a", "b"], ["aa", "b"]]},
        {"input": {"s": "a"}, "output": [["a"]]},
        {"input": {"s": "aba"}, "output": [["a", "b", "a"], ["aba"]]},
    ],
}
