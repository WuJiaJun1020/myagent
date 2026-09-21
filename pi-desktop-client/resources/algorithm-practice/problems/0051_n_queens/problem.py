def _check(actual, expected):
    return sorted(actual) == sorted(expected)


def _check_stdout(actual, expected):
    return sorted(actual.splitlines()) == sorted(expected.splitlines())


PROBLEM = {
    "id": 51,
    "title": "N 皇后",
    "slug": "n_queens",
    "difficulty": "hard",
    "tags": ["数组", "回溯"],
    "description": "按照国际象棋的规则，皇后可以攻击与之处在同一行或同一列或同一斜线上的棋子。\n\nn 皇后问题研究的是如何将 n 个皇后放置在 n×n 的棋盘上，并且使皇后彼此之间不能相互攻击。\n\n给你一个整数 n ，返回所有不同的 n 皇后问题的解决方案。\n\n每一种解法包含一个不同的 n 皇后问题的棋子放置方案，该方案中 'Q' 和 '.' 分别代表了皇后和空位。",
    "examples": [
        {"input": {"n": 4}, "output": [[".Q..", "...Q", "Q...", "..Q."], ["..Q.", "Q...", "...Q", ".Q.."]]},
        {"input": {"n": 1}, "output": [["Q"]]},
    ],
    "constraints": [
        "1 <= n <= 9",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "solveNQueens",
        "params": [("n", "int")],
        "return": "List[List[str]]",
    },
    "check": _check,
    "check_stdout": _check_stdout,
    "acm": {
        "input_fields": [("n", "int")],
        "output_type": "List[List[str]]",
        "description": "输入一行整数 n。输出每个方案一行（各行空格分隔，顺序任意）。",
    },
    "test_cases": [
        {"input": {"n": 4}, "output": [[".Q..", "...Q", "Q...", "..Q."], ["..Q.", "Q...", "...Q", ".Q.."]]},
        {"input": {"n": 1}, "output": [["Q"]]},
    ],
}
