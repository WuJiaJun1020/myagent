PROBLEM = {
    "id": 56,
    "title": "合并区间",
    "slug": "merge_intervals",
    "difficulty": "medium",
    "tags": ["数组", "排序"],
    "description": (
        "以数组 intervals 表示若干个区间的集合，其中单个区间为 intervals[i] = [starti, endi] 。"
        "请你合并所有重叠的区间，并返回一个不重叠的区间数组，该数组需恰好覆盖输入中的所有区间。"
    ),
    "examples": [
        {"input": {"intervals": [[1, 3], [2, 6], [8, 10], [15, 18]]}, "output": [[1, 6], [8, 10], [15, 18]]},
        {"input": {"intervals": [[1, 4], [4, 5]]}, "output": [[1, 5]]},
    ],
    "constraints": [
        "1 <= intervals.length <= 10^4",
        "intervals[i].length == 2",
        "0 <= starti <= endi <= 10^4",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "merge",
        "params": [("intervals", "List[List[int]]")],
        "return": "List[List[int]]",
    },
    "acm": {
        "input_fields": [("intervals", "List[List[int]]")],
        "output_type": "List[List[int]]",
        "description": "输入每行一个区间（两个整数，空格分隔）。输出合并后的区间，每行一个。",
    },
    "test_cases": [
        {"input": {"intervals": [[1, 3], [2, 6], [8, 10], [15, 18]]}, "output": [[1, 6], [8, 10], [15, 18]]},
        {"input": {"intervals": [[1, 4], [4, 5]]}, "output": [[1, 5]]},
        {"input": {"intervals": [[1, 4], [2, 3]]}, "output": [[1, 4]]},
        {"input": {"intervals": [[1, 4], [0, 4]]}, "output": [[0, 4]]},
        {"input": {"intervals": [[2, 3], [4, 5], [6, 7], [8, 9], [1, 10]]}, "output": [[1, 10]]},
    ],
}
