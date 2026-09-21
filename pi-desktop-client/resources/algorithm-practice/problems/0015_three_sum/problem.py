def _check(actual, expected):
    def norm(x):
        return sorted(sorted(t) for t in x)
    return norm(actual) == norm(expected)


def _check_stdout(actual, expected):
    def norm(s):
        return sorted(tuple(sorted(line.split())) for line in s.strip().splitlines())
    return norm(actual) == norm(expected)


PROBLEM = {
    "id": 15,
    "title": "三数之和",
    "slug": "three_sum",
    "difficulty": "medium",
    "tags": ["数组", "双指针", "排序"],
    "description": (
        "给你一个整数数组 nums ，判断是否存在三元组 [nums[i], nums[j], nums[k]] 满足 i != j、i != k 且 j != k ，"
        "同时还满足 nums[i] + nums[j] + nums[k] == 0 。请你返回所有和为 0 且不重复的三元组。\n\n"
        "注意：答案中不可以包含重复的三元组。"
    ),
    "examples": [
        {"input": {"nums": [-1, 0, 1, 2, -1, -4]}, "output": [[-1, -1, 2], [-1, 0, 1]],
         "explanation": "不同的三元组是 [-1,0,1] 和 [-1,-1,2] 。"},
        {"input": {"nums": [0, 1, 1]}, "output": []},
        {"input": {"nums": [0, 0, 0]}, "output": [[0, 0, 0]]},
    ],
    "constraints": [
        "3 <= nums.length <= 3000",
        "-10^5 <= nums[i] <= 10^5",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "threeSum",
        "params": [("nums", "List[int]")],
        "return": "List[List[int]]",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "List[List[int]]",
        "description": "输入一行整数数组 nums（空格分隔）。输出每行一个三元组（组内空格分隔，顺序任意）。",
    },
    "check": _check,
    "check_stdout": _check_stdout,
    "test_cases": [
        {"input": {"nums": [-1, 0, 1, 2, -1, -4]}, "output": [[-1, -1, 2], [-1, 0, 1]]},
        {"input": {"nums": [0, 1, 1]}, "output": []},
        {"input": {"nums": [0, 0, 0]}, "output": [[0, 0, 0]]},
        {"input": {"nums": [1, 2, -2, -1]}, "output": []},
        {"input": {"nums": [-2, 0, 0, 2, 2]}, "output": [[-2, 0, 2]]},
        {"input": {"nums": [0, 0, 0, 0]}, "output": [[0, 0, 0]]},
    ],
}
