PROBLEM = {
    "id": 54,
    "title": "螺旋矩阵",
    "slug": "spiral_matrix",
    "difficulty": "medium",
    "tags": ["数组", "矩阵", "模拟"],
    "description": "给你一个 m 行 n 列的矩阵 matrix ，请按照顺时针螺旋顺序，返回矩阵中的所有元素。",
    "examples": [
        {"input": {"matrix": [[1, 2, 3], [4, 5, 6], [7, 8, 9]]}, "output": [1, 2, 3, 6, 9, 8, 7, 4, 5]},
        {"input": {"matrix": [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]}, "output": [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]},
    ],
    "constraints": [
        "m == matrix.length",
        "n == matrix[i].length",
        "1 <= m, n <= 10",
        "-100 <= matrix[i][j] <= 100",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "spiralOrder",
        "params": [("matrix", "List[List[int]]")],
        "return": "List[int]",
    },
    "acm": {
        "input_fields": [("matrix", "List[List[int]]")],
        "output_type": "List[int]",
        "description": "输入每行一个矩阵行（空格分隔）。输出螺旋顺序（空格分隔）。",
    },
    "test_cases": [
        {"input": {"matrix": [[1, 2, 3], [4, 5, 6], [7, 8, 9]]}, "output": [1, 2, 3, 6, 9, 8, 7, 4, 5]},
        {"input": {"matrix": [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]}, "output": [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]},
        {"input": {"matrix": [[1]]}, "output": [1]},
        {"input": {"matrix": [[1, 2], [3, 4]]}, "output": [1, 2, 4, 3]},
    ],
}
