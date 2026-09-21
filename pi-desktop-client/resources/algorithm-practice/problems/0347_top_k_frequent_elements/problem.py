def _check(actual, expected):
    return sorted(actual) == sorted(expected)


def _check_stdout(actual, expected):
    return sorted(actual.split()) == sorted(expected.split())


PROBLEM = {
    "id": 347,
    "title": "前 K 个高频元素",
    "slug": "top_k_frequent_elements",
    "difficulty": "medium",
    "tags": ["数组", "哈希表", "分治", "堆（优先队列）"],
    "description": "给你一个整数数组 nums 和一个整数 k ，请你返回其中出现频率前 k 高的元素。你可以按任意顺序返回答案。",
    "examples": [
        {"input": {"nums": [1, 1, 1, 2, 2, 3], "k": 2}, "output": [1, 2]},
        {"input": {"nums": [1], "k": 1}, "output": [1]},
    ],
    "constraints": [
        "1 <= nums.length <= 10^5",
        "k 的取值范围是 [1, 数组中不相同的元素的个数]",
        "题目数据保证答案唯一",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "topKFrequent",
        "params": [("nums", "List[int]"), ("k", "int")],
        "return": "List[int]",
    },
    "acm": {
        "input_fields": [("nums", "List[int]"), ("k", "int")],
        "output_type": "List[int]",
        "description": "第一行：nums（空格分隔）；第二行：k。输出前 k 高频元素（空格分隔，顺序任意）。",
    },
    "check": _check,
    "check_stdout": _check_stdout,
    "test_cases": [
        {"input": {"nums": [1, 1, 1, 2, 2, 3], "k": 2}, "output": [1, 2]},
        {"input": {"nums": [1], "k": 1}, "output": [1]},
        {"input": {"nums": [1, 1, 2, 2, 3], "k": 2}, "output": [1, 2]},
        {"input": {"nums": [4, 4, 4, 5, 5, 6], "k": 1}, "output": [4]},
    ],
}
