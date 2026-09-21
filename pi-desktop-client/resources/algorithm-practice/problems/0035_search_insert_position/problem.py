PROBLEM = {
    "id": 35,
    "title": "搜索插入位置",
    "slug": "search_insert_position",
    "difficulty": "easy",
    "tags": ["数组", "二分查找"],
    "description": "给定一个排序数组和一个目标值，在数组中找到目标值，并返回其索引。如果目标值不存在于数组中，返回它将会被按顺序插入的位置。\n\n请必须使用时间复杂度为 O(log n) 的算法。",
    "examples": [
        {"input": {"nums": [1, 3, 5, 6], "target": 5}, "output": 2},
        {"input": {"nums": [1, 3, 5, 6], "target": 2}, "output": 1},
        {"input": {"nums": [1, 3, 5, 6], "target": 7}, "output": 4},
    ],
    "constraints": [
        "1 <= nums.length <= 10^4",
        "-10^4 <= nums[i] <= 10^4",
        "nums 为无重复元素的升序排列数组",
        "-10^4 <= target <= 10^4",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "searchInsert",
        "params": [("nums", "List[int]"), ("target", "int")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("nums", "List[int]"), ("target", "int")],
        "output_type": "int",
        "description": "第一行：nums（空格分隔）；第二行：target。输出插入位置。",
    },
    "test_cases": [
        {"input": {"nums": [1, 3, 5, 6], "target": 5}, "output": 2},
        {"input": {"nums": [1, 3, 5, 6], "target": 2}, "output": 1},
        {"input": {"nums": [1, 3, 5, 6], "target": 7}, "output": 4},
        {"input": {"nums": [1, 3, 5, 6], "target": 0}, "output": 0},
        {"input": {"nums": [1], "target": 0}, "output": 0},
    ],
}
