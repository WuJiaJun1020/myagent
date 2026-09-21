PROBLEM = {
    "id": 394,
    "title": "字符串解码",
    "slug": "decode_string",
    "difficulty": "medium",
    "tags": ["栈", "递归", "字符串"],
    "description": (
        "给定一个经过编码的字符串，返回它解码后的字符串。\n\n"
        "编码规则为: k[encoded_string]，表示其中方括号内部的 encoded_string 正好重复 k 次。注意 k 保证为正整数。\n\n"
        "你可以认为输入字符串总是有效的；输入字符串中没有额外的空格，且输入的方括号总是符合格式要求的。\n\n"
        "此外，你可以认为原始数据不包含数字，所有的数字只表示重复的次数 k ，例如不会出现像 3a 或 2[4] 的输入。"
    ),
    "examples": [
        {"input": {"s": "3[a]2[bc]"}, "output": "aaabcbc"},
        {"input": {"s": "3[a2[c]]"}, "output": "accaccacc"},
        {"input": {"s": "2[abc]3[cd]ef"}, "output": "abcabccdcdcdef"},
    ],
    "constraints": [
        "1 <= s.length <= 30",
        "s 由小写英文字母、数字和方括号 '[]' 组成",
        "s 保证是一个 有效 的输入",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "decodeString",
        "params": [("s", "str")],
        "return": "str",
    },
    "acm": {
        "input_fields": [("s", "str")],
        "output_type": "str",
        "description": "输入一行字符串 s。输出解码后的字符串。",
    },
    "test_cases": [
        {"input": {"s": "3[a]2[bc]"}, "output": "aaabcbc"},
        {"input": {"s": "3[a2[c]]"}, "output": "accaccacc"},
        {"input": {"s": "2[abc]3[cd]ef"}, "output": "abcabccdcdcdef"},
        {"input": {"s": "abc"}, "output": "abc"},
        {"input": {"s": "10[a]"}, "output": "aaaaaaaaaa"},
    ],
}
