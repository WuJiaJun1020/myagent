PROBLEM = {
    "id": 20,
    "title": "有效的括号",
    "slug": "valid_parentheses",
    "difficulty": "easy",
    "tags": ["栈", "字符串"],
    "description": (
        "给定一个只包括 '('，')'，'{'，'}'，'['，']' 的字符串 s ，判断字符串是否有效。\n\n"
        "有效字符串需满足：\n"
        "1. 左括号必须用相同类型的右括号闭合。\n"
        "2. 左括号必须以正确的顺序闭合。\n"
        "3. 每个右括号都有一个对应的相同类型的左括号。"
    ),
    "examples": [
        {"input": {"s": "()"}, "output": True},
        {"input": {"s": "()[]{}"}, "output": True},
        {"input": {"s": "(]"}, "output": False},
    ],
    "constraints": [
        "1 <= s.length <= 10^4",
        "s 仅由括号 '()[]{}' 组成",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "isValid",
        "params": [("s", "str")],
        "return": "bool",
    },
    "acm": {
        "input_fields": [("s", "str")],
        "output_type": "bool",
        "description": "输入一行括号字符串 s。输出 true 或 false（小写）。",
    },
    "test_cases": [
        {"input": {"s": "()"}, "output": True},
        {"input": {"s": "()[]{}"}, "output": True},
        {"input": {"s": "(]"}, "output": False},
        {"input": {"s": "([)]"}, "output": False},
        {"input": {"s": "{[]}"}, "output": True},
        {"input": {"s": "("}, "output": False},
        {"input": {"s": "]"}, "output": False},
    ],
}
