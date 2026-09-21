PROBLEM = {
    "id": 763,
    "title": "划分字母区间",
    "slug": "partition_labels",
    "difficulty": "medium",
    "tags": ["贪心", "哈希表", "双指针", "字符串"],
    "description": "给你一个字符串 s 。我们要把这个字符串划分为尽可能多的片段，同一字母最多出现在一个片段中。\n\n注意，划分结果需要满足：将所有划分结果按顺序连接，得到的字符串仍然是 s 。\n\n返回一个表示每个字符串片段的长度的列表。",
    "examples": [
        {"input": {"s": "ababcbacadefegdehijhklij"}, "output": [9, 7, 8]},
        {"input": {"s": "eccbbbbdec"}, "output": [10]},
    ],
    "constraints": [
        "1 <= s.length <= 500",
        "s 仅由小写英文字母组成",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "partitionLabels",
        "params": [("s", "str")],
        "return": "List[int]",
    },
    "acm": {
        "input_fields": [("s", "str")],
        "output_type": "List[int]",
        "description": "输入一行字符串 s。输出每个片段长度（空格分隔）。",
    },
    "test_cases": [
        {"input": {"s": "ababcbacadefegdehijhklij"}, "output": [9, 7, 8]},
        {"input": {"s": "eccbbbbdec"}, "output": [10]},
        {"input": {"s": "abac"}, "output": [3, 1]},
    ],
}
