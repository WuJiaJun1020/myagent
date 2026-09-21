PROBLEM = {
    "id": 994,
    "title": "腐烂的橘子",
    "slug": "rotting_oranges",
    "difficulty": "medium",
    "tags": ["广度优先搜索", "数组", "矩阵"],
    "description": (
        "在给定的 m x n 网格 grid 中，每个单元格可以有以下三个值之一：\n"
        "- 值 0 代表空单元格；\n"
        "- 值 1 代表新鲜橘子；\n"
        "- 值 2 代表腐烂的橘子。\n\n"
        "每分钟，腐烂的橘子周围 4 个方向上相邻的新鲜橘子都会腐烂。\n\n"
        "返回直到单元格中没有新鲜橘子为止所必须经过的最小分钟数。如果不可能，返回 -1 。"
    ),
    "examples": [
        {"input": {"grid": [[2, 1, 1], [1, 1, 0], [0, 1, 1]]}, "output": 4},
        {"input": {"grid": [[2, 1, 1], [0, 1, 1], [1, 0, 1]]}, "output": -1},
        {"input": {"grid": [[0, 2]]}, "output": 0},
    ],
    "constraints": [
        "m == grid.length",
        "n == grid[i].length",
        "1 <= m, n <= 10",
        "grid[i][j] 仅为 0、1 或 2",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "orangesRotting",
        "params": [("grid", "List[List[int]]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("grid", "List[List[int]]")],
        "output_type": "int",
        "description": "输入每行一个网格行（空格分隔的 0/1/2）。输出最小分钟数（不可能输出 -1）。",
    },
    "test_cases": [
        {"input": {"grid": [[2, 1, 1], [1, 1, 0], [0, 1, 1]]}, "output": 4},
        {"input": {"grid": [[2, 1, 1], [0, 1, 1], [1, 0, 1]]}, "output": -1},
        {"input": {"grid": [[0, 2]]}, "output": 0},
        {"input": {"grid": [[0]]}, "output": 0},
        {"input": {"grid": [[1]]}, "output": -1},
    ],
}
