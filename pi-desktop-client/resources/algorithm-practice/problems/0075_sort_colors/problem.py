PROBLEM = {
    "id": 75,
    "title": "颜色分类",
    "slug": "sort_colors",
    "difficulty": "medium",
    "tags": ["数组", "双指针", "排序"],
    "description": (
        "给定一个包含红色、白色和蓝色、共 n 个元素的数组 nums ，原地对它们进行排序，"
        "使得相同颜色的元素相邻，并按照红色、白色、蓝色顺序排列。\n\n"
        "我们使用整数 0、1 和 2 分别表示红色、白色和蓝色。\n\n"
        "必须在不使用库内置的 sort 函数的情况下解决这个问题。"
    ),
    "examples": [
        {"input": {"nums": [2, 0, 2, 1, 1, 0]}, "output": [0, 0, 1, 1, 2, 2]},
        {"input": {"nums": [2, 0, 1]}, "output": [0, 1, 2]},
    ],
    "constraints": [
        "n == nums.length",
        "1 <= n <= 300",
        "nums[i] 为 0、1 或 2",
    ],
    "follow_up": "你能想出一个仅使用常数空间的一趟扫描算法吗？",
    "leetcode": {
        "class": "Solution",
        "method": "sortColors",
        "params": [("nums", "List[int]")],
        "return": "None",
        "inplace": "nums",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "List[int]",
        "description": "输入一行整数数组 nums（空格分隔，值为 0/1/2）。输出排序后的数组（空格分隔）。",
    },
    "test_cases": [
        {"input": {"nums": [2, 0, 2, 1, 1, 0]}, "output": [0, 0, 1, 1, 2, 2]},
        {"input": {"nums": [2, 0, 1]}, "output": [0, 1, 2]},
        {"input": {"nums": [1, 0, 2]}, "output": [0, 1, 2]},
        {"input": {"nums": [0, 1, 2]}, "output": [0, 1, 2]},
        {"input": {"nums": [2, 2, 2, 1, 1, 0]}, "output": [0, 1, 1, 2, 2, 2]},
    ],
}
