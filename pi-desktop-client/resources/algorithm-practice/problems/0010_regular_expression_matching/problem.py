PROBLEM = {
    "id": 10,
    "title": "正则表达式匹配",
    "slug": "regular_expression_matching",
    "difficulty": "hard",
    "tags": ["递归", "字符串", "动态规划"],
    "description": "给你一个字符串 s 和一个字符规律 p，请你来实现一个支持 '.' 和 '*' 的正则表达式匹配。\n\n'.' 匹配任意单个字符\n'*' 匹配零个或多个前面的那一个元素\n\n所谓匹配，是要涵盖整个字符串 s 的，而不是部分字符串。",
    "examples": [
        {"input": {"s": "aa", "p": "a"}, "output": False},
        {"input": {"s": "aa", "p": "a*"}, "output": True},
        {"input": {"s": "ab", "p": ".*"}, "output": True},
    ],
    "constraints": [
        "1 <= s.length <= 20",
        "1 <= p.length <= 20",
        "s 只包含从 a-z 的小写字母",
        "p 只包含从 a-z 的小写字母，以及字符 . 和 *",
        "保证每次出现字符 * 时，前面都匹配到有效的字符",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "isMatch",
        "params": [("s", "str"), ("p", "str")],
        "return": "bool",
    },
    "acm": {
        "input_fields": [("s", "str"), ("p", "str")],
        "output_type": "bool",
        "description": "第一行：字符串 s；第二行：模式 p。输出 true 或 false（小写）。",
    },
    "test_cases": [
        {"input": {"s": "aa", "p": "a"}, "output": False},
        {"input": {"s": "aa", "p": "a*"}, "output": True},
        {"input": {"s": "ab", "p": ".*"}, "output": True},
        {"input": {"s": "aab", "p": "c*a*b"}, "output": True},
        {"input": {"s": "mississippi", "p": "mis*is*p*."}, "output": False},
    ],
}
