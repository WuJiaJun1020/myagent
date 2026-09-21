PROBLEM = {
    "id": 208,
    "title": "实现 Trie (前缀树)",
    "slug": "implement_trie",
    "difficulty": "medium",
    "tags": ["设计", "字典树", "哈希表", "字符串"],
    "description": (
        "Trie（发音类似 \"try\"）或者说 前缀树 是一种树形数据结构，用于高效地存储和检索字符串数据集中的键。"
        "这一数据结构有相当多的应用情景，例如自动补全和拼写检查。\n\n"
        "请你实现 Trie 类：\n"
        "- Trie() 初始化前缀树对象。\n"
        "- void insert(String word) 向前缀树中插入字符串 word 。\n"
        "- boolean search(String word) 如果字符串 word 在前缀树中，返回 true（即，在检索之前已经插入）；否则，返回 false 。\n"
        "- boolean startsWith(String prefix) 如果之前已经插入的字符串 word 的前缀之一为 prefix ，返回 true ；否则，返回 false 。"
    ),
    "constraints": [
        "1 <= word.length, prefix.length <= 2000",
        "word 和 prefix 仅由小写英文字母组成",
        "insert、search 和 startsWith 调用次数 总计 不超过 3 * 10^4 次",
    ],
    "leetcode": {
        "class": "Trie",
    },
    "acm": {
        "input_fields": [("operations", "JSON"), ("arguments", "JSON")],
        "output_type": "JSON",
        "description": "两行 JSON：第一行 operations（方法名数组），第二行 arguments（参数数组）。输出结果 JSON 数组。",
    },
    "test_cases": [
        {
            "input": {
                "operations": ["Trie", "insert", "search", "search", "startsWith", "insert", "search"],
                "arguments": [[], ["apple"], ["apple"], ["app"], ["app"], ["app"], ["app"]],
            },
            "output": [None, None, True, False, True, None, True],
        },
        {
            "input": {
                "operations": ["Trie", "insert", "insert", "search", "search", "startsWith", "startsWith", "insert", "search"],
                "arguments": [[], ["hello"], ["hell"], ["hell"], ["hello"], ["hell"], ["he"], ["hello"], ["hello"]],
            },
            "output": [None, None, None, True, True, True, True, None, True],
        },
        {
            "input": {
                "operations": ["Trie", "insert", "search", "startsWith", "search", "startsWith"],
                "arguments": [[], ["ab"], ["a"], ["a"], ["abc"], ["ac"]],
            },
            "output": [None, None, False, True, False, False],
        },
    ],
}
