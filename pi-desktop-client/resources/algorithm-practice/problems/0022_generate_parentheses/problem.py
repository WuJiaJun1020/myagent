def _check(actual, expected):
    return sorted(actual) == sorted(expected)


def _check_stdout(actual, expected):
    return sorted(actual.split()) == sorted(expected.split())


PROBLEM = {
    "id": 22,
    "title": "括号生成",
    "slug": "generate_parentheses",
    "difficulty": "medium",
    "tags": ["字符串", "动态规划", "回溯"],
    "description": "数字 n 代表生成括号的对数，请你设计一个函数，用于能够生成所有可能的并且有效的括号组合。",
    "examples": [
        {"input": {"n": 3}, "output": ["((()))", "(()())", "(())()", "()(())", "()()()"]},
        {"input": {"n": 1}, "output": ["()"]},
    ],
    "constraints": [
        "1 <= n <= 8",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "generateParenthesis",
        "params": [("n", "int")],
        "return": "List[str]",
    },
    "acm": {
        "input_fields": [("n", "int")],
        "output_type": "List[str]",
        "description": "输入一行整数 n。输出所有括号组合（空格分隔，顺序任意）。",
    },
    "check": _check,
    "check_stdout": _check_stdout,
    "test_cases": [
        {"input": {"n": 3}, "output": ["((()))", "(()())", "(())()", "()(())", "()()()"]},
        {"input": {"n": 1}, "output": ["()"]},
        {"input": {"n": 2}, "output": ["(())", "()()"]},
    ],
}
