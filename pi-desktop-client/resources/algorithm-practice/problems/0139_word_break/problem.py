PROBLEM = {
    "id": 139,
    "title": "单词拆分",
    "slug": "word_break",
    "difficulty": "medium",
    "tags": ["字典树", "记忆化搜索", "哈希表", "字符串", "动态规划"],
    "description": "给你一个字符串 s 和一个字符串列表 wordDict 作为字典。如果可以利用字典中出现的一个或多个单词拼接出 s 则返回 true。\n\n注意：不要求字典中出现的单词全部都使用，并且字典中的单词可以重复使用。",
    "examples": [
        {"input": {"s": "leetcode", "wordDict": ["leet", "code"]}, "output": True},
        {"input": {"s": "applepenapple", "wordDict": ["apple", "pen"]}, "output": True},
        {"input": {"s": "catsandog", "wordDict": ["cats", "dog", "sand", "and", "cat"]}, "output": False},
    ],
    "constraints": [
        "1 <= s.length <= 300",
        "1 <= wordDict.length <= 1000",
        "1 <= wordDict[i].length <= 20",
        "s 和 wordDict[i] 仅由小写英文字母组成",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "wordBreak",
        "params": [("s", "str"), ("wordDict", "List[str]")],
        "return": "bool",
    },
    "acm": {
        "input_fields": [("s", "str"), ("wordDict", "List[str]")],
        "output_type": "bool",
        "description": "第一行：字符串 s；第二行：字典单词（空格分隔）。输出 true 或 false（小写）。",
    },
    "test_cases": [
        {"input": {"s": "leetcode", "wordDict": ["leet", "code"]}, "output": True},
        {"input": {"s": "applepenapple", "wordDict": ["apple", "pen"]}, "output": True},
        {"input": {"s": "catsandog", "wordDict": ["cats", "dog", "sand", "and", "cat"]}, "output": False},
    ],
}
