PROBLEM = {
    "id": 74,
    "title": "搜索二维矩阵",
    "slug": "search_a_2d_matrix",
    "difficulty": "medium",
    "tags": ["数组", "二分查找", "矩阵"],
    "description": (
        "给你一个满足下述两条属性的 m x n 整数矩阵：\n"
        "- 每行中的整数从左到右按非严格递增顺序排列。\n"
        "- 每行的第一个整数大于前一行的最后一个整数。\n\n"
        "给你一个整数 target ，如果 target 在矩阵中，返回 true ；否则，返回 false 。"
    ),
    "examples": [
        {"input": {"matrix": [[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]], "target": 3}, "output": True},
        {"input": {"matrix": [[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]], "target": 13}, "output": False},
    ],
    "constraints": [
        "m == matrix.length",
        "n == matrix[i].length",
        "1 <= m, n <= 100",
        "-10^4 <= matrix[i][j], target <= 10^4",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "searchMatrix",
        "params": [("matrix", "List[List[int]]"), ("target", "int")],
        "return": "bool",
    },
    "acm": {
        "input_fields": [("matrix", "List[List[int]]"), ("target", "int")],
        "output_type": "bool",
        "description": "前若干行：矩阵行（空格分隔）；最后一行：target。输出 true 或 false（小写）。",
    },
    "test_cases": [
        {"input": {"matrix": [[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]], "target": 3}, "output": True},
        {"input": {"matrix": [[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]], "target": 13}, "output": False},
        {"input": {"matrix": [[1]], "target": 1}, "output": True},
        {"input": {"matrix": [[1]], "target": 2}, "output": False},
    ],
}
