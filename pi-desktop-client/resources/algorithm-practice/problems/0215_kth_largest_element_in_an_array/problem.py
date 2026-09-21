PROBLEM = {
    "id": 215,
    "title": "数组中的第K个最大元素",
    "slug": "kth_largest_element_in_an_array",
    "difficulty": "medium",
    "tags": ["数组", "分治", "快速选择", "堆（优先队列）"],
    "description": "给定整数数组 nums 和整数 k，请返回数组中第 k 个最大的元素。\n\n请注意，你需要找的是数组排序后的第 k 个最大的元素，而不是第 k 个不同的元素。\n\n你必须设计并实现时间复杂度为 O(n) 的算法解决此问题。",
    "examples": [
        {"input": {"nums": [3, 2, 1, 5, 6, 4], "k": 2}, "output": 5},
        {"input": {"nums": [3, 2, 3, 1, 2, 4, 5, 5, 6], "k": 4}, "output": 4},
    ],
    "constraints": [
        "1 <= k <= nums.length <= 10^5",
        "-10^4 <= nums[i] <= 10^4",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "findKthLargest",
        "params": [("nums", "List[int]"), ("k", "int")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("nums", "List[int]"), ("k", "int")],
        "output_type": "int",
        "description": "第一行：nums（空格分隔）；第二行：k。输出第 k 大的元素。",
    },
    "test_cases": [
        {"input": {"nums": [3, 2, 1, 5, 6, 4], "k": 2}, "output": 5},
        {"input": {"nums": [3, 2, 3, 1, 2, 4, 5, 5, 6], "k": 4}, "output": 4},
        {"input": {"nums": [1], "k": 1}, "output": 1},
        {"input": {"nums": [2, 1], "k": 1}, "output": 2},
    ],
}
