def _check(actual, expected):
    # 答案不唯一：校验是回文串且长度为最长回文长度
    return actual == actual[::-1] and len(actual) == len(expected)


def _check_stdout(actual, expected):
    a = actual.strip()
    return a == a[::-1] and len(a) == len(expected.strip())


PROBLEM = {
    "id": 5,
    "title": "最长回文子串",
    "slug": "longest_palindromic_substring",
    "difficulty": "medium",
    "tags": ["字符串", "动态规划"],
    "description": "给你一个字符串 s，找到 s 中最长的回文子串。\n\n如果字符串的反序与原始字符串相同，则该字符串称为回文字符串。",
    "examples": [
        {"input": {"s": "babad"}, "output": "bab", "explanation": "\"aba\" 同样是符合题意的答案。"},
        {"input": {"s": "cbbd"}, "output": "bb"},
    ],
    "constraints": [
        "1 <= s.length <= 1000",
        "s 仅由数字和英文字母组成",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "longestPalindrome",
        "params": [("s", "str")],
        "return": "str",
    },
    "acm": {
        "input_fields": [("s", "str")],
        "output_type": "str",
        "description": "输入一行字符串 s。输出最长回文子串。",
    },
    "check": _check,
    "check_stdout": _check_stdout,
    "test_cases": [
        {"input": {"s": "babad"}, "output": "bab"},
        {"input": {"s": "cbbd"}, "output": "bb"},
        {"input": {"s": "a"}, "output": "a"},
        {"input": {"s": "ac"}, "output": "a"},
    ],
}
