PROBLEM = {
    "id": 118,
    "title": "杨辉三角",
    "slug": "pascals_triangle",
    "difficulty": "easy",
    "tags": ["数组", "动态规划"],
    "description": "给定一个非负整数 numRows，生成「杨辉三角」的前 numRows 行。\n\n在「杨辉三角」中，每个数是它左上方和右上方的数的和。",
    "examples": [
        {"input": {"numRows": 5}, "output": [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1]]},
        {"input": {"numRows": 1}, "output": [[1]]},
    ],
    "constraints": [
        "1 <= numRows <= 30",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "generate",
        "params": [("numRows", "int")],
        "return": "List[List[int]]",
    },
    "acm": {
        "input_fields": [("numRows", "int")],
        "output_type": "List[List[int]]",
        "description": "输入一行整数 numRows。输出每行一组（空格分隔）。",
    },
    "test_cases": [
        {"input": {"numRows": 5}, "output": [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1]]},
        {"input": {"numRows": 1}, "output": [[1]]},
        {"input": {"numRows": 2}, "output": [[1], [1, 1]]},
        {"input": {"numRows": 3}, "output": [[1], [1, 1], [1, 2, 1]]},
    ],
}
