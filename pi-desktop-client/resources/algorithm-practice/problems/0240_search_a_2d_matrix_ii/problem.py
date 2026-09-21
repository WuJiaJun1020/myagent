PROBLEM = {
    "id": 240,
    "title": "搜索二维矩阵 II",
    "slug": "search_a_2d_matrix_ii",
    "difficulty": "medium",
    "tags": ["数组", "二分查找", "分治", "矩阵"],
    "description": "编写一个高效的算法来搜索 m x n 矩阵 matrix 中的一个目标值 target 。该矩阵具有以下特性：\n- 每行的元素从左到右升序排列。\n- 每列的元素从上到下升序排列。",
    "examples": [
        {"input": {"matrix": [[1, 4, 7, 11, 15], [2, 5, 8, 12, 19], [3, 6, 9, 16, 22], [10, 13, 14, 17, 24], [18, 21, 23, 26, 30]], "target": 5}, "output": True},
        {"input": {"matrix": [[1, 4, 7, 11, 15], [2, 5, 8, 12, 19], [3, 6, 9, 16, 22], [10, 13, 14, 17, 24], [18, 21, 23, 26, 30]], "target": 20}, "output": False},
    ],
    "constraints": [
        "m == matrix.length",
        "n == matrix[i].length",
        "1 <= n, m <= 300",
        "-10^9 <= matrix[i][j] <= 10^9",
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
        {"input": {"matrix": [[1, 4, 7, 11, 15], [2, 5, 8, 12, 19], [3, 6, 9, 16, 22], [10, 13, 14, 17, 24], [18, 21, 23, 26, 30]], "target": 5}, "output": True},
        {"input": {"matrix": [[1, 4, 7, 11, 15], [2, 5, 8, 12, 19], [3, 6, 9, 16, 22], [10, 13, 14, 17, 24], [18, 21, 23, 26, 30]], "target": 20}, "output": False},
        {"input": {"matrix": [[1]], "target": 1}, "output": True},
    ],
}
