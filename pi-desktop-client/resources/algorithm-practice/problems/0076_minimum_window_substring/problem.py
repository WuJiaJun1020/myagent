PROBLEM = {
    "id": 76,
    "title": "最小覆盖子串",
    "slug": "minimum_window_substring",
    "difficulty": "hard",
    "tags": ["哈希表", "字符串", "滑动窗口"],
    "description": (
        "给你一个字符串 s 、一个字符串 t 。返回 s 中涵盖 t 所有字符的最小子串。如果 s 中不存在涵盖 t 所有字符的子串，则返回空字符串 \"\" 。\n\n"
        "注意：对于 t 中重复字符，我们寻找的子字符串中该字符数量必须不少于 t 中该字符数量。如果 s 中存在这样的子串，我们保证它是唯一的答案。"
    ),
    "examples": [
        {"input": {"s": "ADOBECODEBANC", "t": "ABC"}, "output": "BANC"},
        {"input": {"s": "a", "t": "a"}, "output": "a"},
        {"input": {"s": "a", "t": "aa"}, "output": ""},
    ],
    "constraints": [
        "m == s.length",
        "n == t.length",
        "1 <= m, n <= 10^5",
        "s 和 t 由英文字母组成",
    ],
    "follow_up": "你能设计一个在 O(m+n) 时间内解决此问题的算法吗？",
    "leetcode": {
        "class": "Solution",
        "method": "minWindow",
        "params": [("s", "str"), ("t", "str")],
        "return": "str",
    },
    "acm": {
        "input_fields": [("s", "str"), ("t", "str")],
        "output_type": "str",
        "description": "第一行：字符串 s；第二行：字符串 t。输出最小覆盖子串（无则输出空）。",
    },
    "test_cases": [
        {"input": {"s": "ADOBECODEBANC", "t": "ABC"}, "output": "BANC"},
        {"input": {"s": "a", "t": "a"}, "output": "a"},
        {"input": {"s": "a", "t": "aa"}, "output": ""},
        {"input": {"s": "a", "t": "b"}, "output": ""},
    ],
}
