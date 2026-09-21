PROBLEM = {
    "id": 79,
    "title": "单词搜索",
    "slug": "word_search",
    "difficulty": "medium",
    "tags": ["数组", "字符串", "回溯", "矩阵"],
    "description": "给定一个 m x n 二维字符网格 board 和一个字符串单词 word 。如果 word 存在于网格中，返回 true ；否则，返回 false 。\n\n单词必须按照字母顺序，通过相邻的单元格内的字母构成，其中“相邻”单元格是那些水平相邻或垂直相邻的单元格。同一个单元格内的字母不允许被重复使用。",
    "examples": [
        {"input": {"board": [["A", "B", "C", "E"], ["S", "F", "C", "S"], ["A", "D", "E", "E"]], "word": "ABCCED"}, "output": True},
        {"input": {"board": [["A", "B", "C", "E"], ["S", "F", "C", "S"], ["A", "D", "E", "E"]], "word": "SEE"}, "output": True},
        {"input": {"board": [["A", "B", "C", "E"], ["S", "F", "C", "S"], ["A", "D", "E", "E"]], "word": "ABCB"}, "output": False},
    ],
    "constraints": [
        "m == board.length",
        "n = board[i].length",
        "1 <= m, n <= 6",
        "1 <= word.length <= 15",
        "board 和 word 仅由大小写英文字母组成",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "exist",
        "params": [("board", "List[List[str]]"), ("word", "str")],
        "return": "bool",
    },
    "acm": {
        "input_fields": [("board", "List[List[str]]"), ("word", "str")],
        "output_type": "bool",
        "description": "前若干行：board（每行字符空格分隔）；最后一行：word。输出 true 或 false（小写）。",
    },
    "test_cases": [
        {"input": {"board": [["A", "B", "C", "E"], ["S", "F", "C", "S"], ["A", "D", "E", "E"]], "word": "ABCCED"}, "output": True},
        {"input": {"board": [["A", "B", "C", "E"], ["S", "F", "C", "S"], ["A", "D", "E", "E"]], "word": "SEE"}, "output": True},
        {"input": {"board": [["A", "B", "C", "E"], ["S", "F", "C", "S"], ["A", "D", "E", "E"]], "word": "ABCB"}, "output": False},
    ],
}
