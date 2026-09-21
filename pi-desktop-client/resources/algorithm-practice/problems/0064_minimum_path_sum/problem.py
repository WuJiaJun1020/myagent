PROBLEM = {
    "id": 64,
    "title": "最小路径和",
    "slug": "minimum_path_sum",
    "difficulty": "medium",
    "tags": ["数组", "动态规划", "矩阵"],
    "description": (
        "给定一个包含非负整数的 m x n 网格 grid ，请找出一条从左上角到右下角的路径，使得路径上的数字总和为最小。\n\n"
        "说明：每次只能向下或者向右移动一步。"
    ),
    "examples": [
        {"input": {"grid": [[1, 3, 1], [1, 5, 1], [4, 2, 1]]}, "output": 7},
        {"input": {"grid": [[1, 2, 3], [4, 5, 6]]}, "output": 12},
    ],
    "constraints": [
        "m == grid.length",
        "n == grid[i].length",
        "1 <= m, n <= 200",
        "0 <= grid[i][j] <= 200",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "minPathSum",
        "params": [("grid", "List[List[int]]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("grid", "List[List[int]]")],
        "output_type": "int",
        "description": "输入每行一个网格行（空格分隔的整数）。输出最小路径和。",
    },
    "test_cases": [
        {"input": {"grid": [[1, 3, 1], [1, 5, 1], [4, 2, 1]]}, "output": 7},
        {"input": {"grid": [[1, 2, 3], [4, 5, 6]]}, "output": 12},
        {"input": {"grid": [[1]]}, "output": 1},
        {"input": {"grid": [[1, 2], [1, 1]]}, "output": 3},
    ],
}
