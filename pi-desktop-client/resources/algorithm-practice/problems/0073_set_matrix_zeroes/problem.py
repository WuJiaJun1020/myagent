PROBLEM = {
    "id": 73,
    "title": "矩阵置零",
    "slug": "set_matrix_zeroes",
    "difficulty": "medium",
    "tags": ["数组", "哈希表", "矩阵"],
    "description": "给定一个 m x n 的矩阵，如果一个元素为 0 ，则将其所在行和列的所有元素都设为 0 。请使用 原地 算法。",
    "examples": [
        {"input": {"matrix": [[1, 1, 1], [1, 0, 1], [1, 1, 1]]}, "output": [[1, 0, 1], [0, 0, 0], [1, 0, 1]]},
        {"input": {"matrix": [[0, 1, 2, 0], [3, 4, 5, 2], [1, 3, 1, 5]]}, "output": [[0, 0, 0, 0], [0, 4, 5, 0], [0, 3, 1, 0]]},
    ],
    "constraints": [
        "m == matrix.length",
        "n == matrix[0].length",
        "1 <= m, n <= 200",
        "-2^31 <= matrix[i][j] <= 2^31 - 1",
    ],
    "follow_up": "你能想出一个只使用常量空间 O(1) 的解决方案吗？",
    "leetcode": {
        "class": "Solution",
        "method": "setZeroes",
        "params": [("matrix", "List[List[int]]")],
        "return": "None",
        "inplace": "matrix",
    },
    "acm": {
        "input_fields": [("matrix", "List[List[int]]")],
        "output_type": "List[List[int]]",
        "description": "输入每行一个矩阵行（空格分隔）。输出置零后的矩阵，每行一个。",
    },
    "test_cases": [
        {"input": {"matrix": [[1, 1, 1], [1, 0, 1], [1, 1, 1]]}, "output": [[1, 0, 1], [0, 0, 0], [1, 0, 1]]},
        {"input": {"matrix": [[0, 1, 2, 0], [3, 4, 5, 2], [1, 3, 1, 5]]}, "output": [[0, 0, 0, 0], [0, 4, 5, 0], [0, 3, 1, 0]]},
        {"input": {"matrix": [[1]]}, "output": [[1]]},
        {"input": {"matrix": [[0]]}, "output": [[0]]},
    ],
}
