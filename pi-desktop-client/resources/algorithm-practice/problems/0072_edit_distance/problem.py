PROBLEM = {
    "id": 72,
    "title": "编辑距离",
    "slug": "edit_distance",
    "difficulty": "medium",
    "tags": ["字符串", "动态规划"],
    "description": "给你两个单词 word1 和 word2，请返回将 word1 转换成 word2 所使用的最少操作数。\n\n你可以对一个单词进行如下三种操作：\n- 插入一个字符\n- 删除一个字符\n- 替换一个字符",
    "examples": [
        {"input": {"word1": "horse", "word2": "ros"}, "output": 3},
        {"input": {"word1": "intention", "word2": "execution"}, "output": 5},
    ],
    "constraints": [
        "0 <= word1.length, word2.length <= 500",
        "word1 和 word2 由小写英文字母组成",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "minDistance",
        "params": [("word1", "str"), ("word2", "str")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("word1", "str"), ("word2", "str")],
        "output_type": "int",
        "description": "第一行：word1；第二行：word2。输出最少操作数。",
    },
    "test_cases": [
        {"input": {"word1": "horse", "word2": "ros"}, "output": 3},
        {"input": {"word1": "intention", "word2": "execution"}, "output": 5},
        {"input": {"word1": "abc", "word2": "abc"}, "output": 0},
        {"input": {"word1": "a", "word2": "ab"}, "output": 1},
    ],
}
