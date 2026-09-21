def _check(actual, expected):
    # 分组顺序、组内顺序均任意
    def norm(x):
        return sorted(sorted(g) for g in x)
    return norm(actual) == norm(expected)


def _check_stdout(actual, expected):
    def norm(s):
        return sorted(tuple(sorted(line.split())) for line in s.strip().splitlines())
    return norm(actual) == norm(expected)


PROBLEM = {
    "id": 49,
    "title": "字母异位词分组",
    "slug": "group_anagrams",
    "difficulty": "medium",
    "tags": ["哈希表", "字符串"],
    "description": (
        "给你一个字符串数组，请你将 字母异位词 组合在一起。可以按任意顺序返回结果列表。\n\n"
        "字母异位词 是由重新排列源单词的所有字母得到的一个新单词。"
    ),
    "examples": [
        {"input": {"strs": ["eat", "tea", "tan", "ate", "nat", "bat"]},
         "output": [["bat"], ["nat", "tan"], ["ate", "eat", "tea"]]},
        {"input": {"strs": [""]}, "output": [[""]]},
        {"input": {"strs": ["a"]}, "output": [["a"]]},
    ],
    "constraints": [
        "1 <= strs.length <= 10^4",
        "0 <= strs[i].length <= 100",
        "strs[i] 仅包含小写字母",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "groupAnagrams",
        "params": [("strs", "List[str]")],
        "return": "List[List[str]]",
    },
    "acm": {
        "input_fields": [("strs", "List[str]")],
        "output_type": "List[List[str]]",
        "description": "输入一行字符串（空格分隔）。输出每行一个分组，组内字符串空格分隔（分组顺序任意）。",
    },
    "check": _check,
    "check_stdout": _check_stdout,
    "test_cases": [
        {"input": {"strs": ["eat", "tea", "tan", "ate", "nat", "bat"]}, "output": [["bat"], ["nat", "tan"], ["ate", "eat", "tea"]]},
        {"input": {"strs": ["a"]}, "output": [["a"]]},
        {"input": {"strs": ["dog", "cat", "pig"]}, "output": [["dog"], ["cat"], ["pig"]]},
        {"input": {"strs": ["abc", "bca", "cab", "xy", "yx"]}, "output": [["abc", "bca", "cab"], ["xy", "yx"]]},
    ],
}
