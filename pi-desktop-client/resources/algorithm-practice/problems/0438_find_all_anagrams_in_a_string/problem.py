PROBLEM = {
    "id": 438,
    "title": "找到字符串中所有字母异位词",
    "slug": "find_all_anagrams_in_a_string",
    "difficulty": "medium",
    "tags": ["哈希表", "字符串", "滑动窗口"],
    "description": "给定两个字符串 s 和 p，找到 s 中所有 p 的异位词的子串，返回这些子串的起始索引。不考虑答案输出的顺序。\n\n异位词指由相同字母重排列形成的字符串（包括相同的字符串）。",
    "examples": [
        {"input": {"s": "cbaebabacd", "p": "abc"}, "output": [0, 6]},
        {"input": {"s": "abab", "p": "ab"}, "output": [0, 1, 2]},
    ],
    "constraints": [
        "1 <= s.length, p.length <= 3 * 10^4",
        "s 和 p 仅包含小写字母",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "findAnagrams",
        "params": [("s", "str"), ("p", "str")],
        "return": "List[int]",
    },
    "acm": {
        "input_fields": [("s", "str"), ("p", "str")],
        "output_type": "List[int]",
        "description": "第一行：字符串 s；第二行：字符串 p。输出起始索引（空格分隔）。",
    },
    "test_cases": [
        {"input": {"s": "cbaebabacd", "p": "abc"}, "output": [0, 6]},
        {"input": {"s": "abab", "p": "ab"}, "output": [0, 1, 2]},
        {"input": {"s": "baa", "p": "aa"}, "output": [1]},
        {"input": {"s": "ab", "p": "ba"}, "output": [0]},
    ],
}
