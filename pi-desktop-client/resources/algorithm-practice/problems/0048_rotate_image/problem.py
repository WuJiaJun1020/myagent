PROBLEM = {
    "id": 48,
    "title": "旋转图像",
    "slug": "rotate_image",
    "difficulty": "medium",
    "tags": ["数组", "数学", "矩阵"],
    "description": "给定一个 n × n 的二维矩阵 matrix 表示一个图像。请你将图像顺时针旋转 90 度。\n\n你必须在 原地 旋转图像，这意味着你需要直接修改输入的二维矩阵。请不要使用另一个矩阵来旋转图像。",
    "examples": [
        {"input": {"matrix": [[1, 2, 3], [4, 5, 6], [7, 8, 9]]}, "output": [[7, 4, 1], [8, 5, 2], [9, 6, 3]]},
        {"input": {"matrix": [[5, 1, 9, 11], [2, 4, 8, 10], [13, 3, 6, 7], [15, 14, 12, 16]]}, "output": [[15, 13, 2, 5], [14, 3, 4, 1], [12, 6, 8, 9], [16, 7, 10, 11]]},
    ],
    "constraints": [
        "n == matrix.length == matrix[i].length",
        "1 <= n <= 20",
        "-1000 <= matrix[i][j] <= 1000",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "rotate",
        "params": [("matrix", "List[List[int]]")],
        "return": "None",
        "inplace": "matrix",
    },
    "acm": {
        "input_fields": [("matrix", "List[List[int]]")],
        "output_type": "List[List[int]]",
        "description": "输入每行一个矩阵行（空格分隔）。输出旋转后的矩阵，每行一个。",
    },
    "test_cases": [
        {"input": {"matrix": [[1, 2, 3], [4, 5, 6], [7, 8, 9]]}, "output": [[7, 4, 1], [8, 5, 2], [9, 6, 3]]},
        {"input": {"matrix": [[5, 1, 9, 11], [2, 4, 8, 10], [13, 3, 6, 7], [15, 14, 12, 16]]}, "output": [[15, 13, 2, 5], [14, 3, 4, 1], [12, 6, 8, 9], [16, 7, 10, 11]]},
        {"input": {"matrix": [[1]]}, "output": [[1]]},
    ],
}
