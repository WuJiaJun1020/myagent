def _check(actual, expected):
    return sorted(actual) == sorted(expected)


def _check_stdout(actual, expected):
    return sorted(actual.split()) == sorted(expected.split())


PROBLEM = {
    "id": 17,
    "title": "电话号码的字母组合",
    "slug": "letter_combinations_of_a_phone_number",
    "difficulty": "medium",
    "tags": ["哈希表", "字符串", "回溯"],
    "description": (
        "给定一个仅包含数字 2-9 的字符串，返回所有它能表示的字母组合。答案可以按任意顺序返回。\n\n"
        "给出数字到字母的映射如下（与电话按键相同）。注意 1 不对应任何字母。"
    ),
    "examples": [
        {"input": {"digits": "23"}, "output": ["ad", "ae", "af", "bd", "be", "bf", "cd", "ce", "cf"]},
        {"input": {"digits": ""}, "output": []},
        {"input": {"digits": "2"}, "output": ["a", "b", "c"]},
    ],
    "constraints": [
        "0 <= digits.length <= 4",
        "digits[i] 是范围 ['2', '9'] 的一个数字",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "letterCombinations",
        "params": [("digits", "str")],
        "return": "List[str]",
    },
    "acm": {
        "input_fields": [("digits", "str")],
        "output_type": "List[str]",
        "description": "输入一行数字字符串 digits。输出所有字母组合（空格分隔，顺序任意）。",
    },
    "check": _check,
    "check_stdout": _check_stdout,
    "test_cases": [
        {"input": {"digits": "23"}, "output": ["ad", "ae", "af", "bd", "be", "bf", "cd", "ce", "cf"]},
        {"input": {"digits": ""}, "output": []},
        {"input": {"digits": "2"}, "output": ["a", "b", "c"]},
        {"input": {"digits": "7"}, "output": ["p", "q", "r", "s"]},
    ],
}
