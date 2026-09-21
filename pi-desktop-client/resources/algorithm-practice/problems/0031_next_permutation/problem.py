PROBLEM = {
    "id": 31,
    "title": "下一个排列",
    "slug": "next_permutation",
    "difficulty": "medium",
    "tags": ["数组", "双指针"],
    "description": (
        "整数数组的 下一个排列 是指其整数的下一个字典序更大的排列。更正式地，如果数组的所有排列根据其字典顺序从小到大排列在一个容器中，"
        "那么数组的 下一个排列 就是在这个有序容器中排在它后面的那个排列。如果不存在下一个更大的排列，那么这个数组必须重排为字典序最小的排列"
        "（即，其元素按升序排列）。\n\n"
        "例如，arr = [1,2,3] 的下一个排列是 [1,3,2] 。类似地，arr = [2,3,1] 的下一个排列是 [3,1,2] 。而 arr = [3,2,1] 的下一个排列是 [1,2,3] 。\n\n"
        "必须 原地 修改，只允许使用额外常数空间。"
    ),
    "examples": [
        {"input": {"nums": [1, 2, 3]}, "output": [1, 3, 2]},
        {"input": {"nums": [3, 2, 1]}, "output": [1, 2, 3]},
        {"input": {"nums": [1, 1, 5]}, "output": [1, 5, 1]},
    ],
    "constraints": [
        "1 <= nums.length <= 100",
        "0 <= nums[i] <= 100",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "nextPermutation",
        "params": [("nums", "List[int]")],
        "return": "None",
        "inplace": "nums",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "List[int]",
        "description": "输入一行整数数组 nums（空格分隔）。输出下一个排列（空格分隔）。",
    },
    "test_cases": [
        {"input": {"nums": [1, 2, 3]}, "output": [1, 3, 2]},
        {"input": {"nums": [3, 2, 1]}, "output": [1, 2, 3]},
        {"input": {"nums": [1, 1, 5]}, "output": [1, 5, 1]},
        {"input": {"nums": [1, 3, 2]}, "output": [2, 1, 3]},
        {"input": {"nums": [2, 3, 1]}, "output": [3, 1, 2]},
        {"input": {"nums": [1]}, "output": [1]},
    ],
}
