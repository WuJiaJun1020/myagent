PROBLEM = {
    "id": 169,
    "title": "多数元素",
    "slug": "majority_element",
    "difficulty": "easy",
    "tags": ["数组", "哈希表", "分治", "计数", "排序"],
    "description": (
        "给定一个大小为 n 的数组 nums ，返回其中的多数元素。多数元素是指在数组中出现次数 大于 ⌊ n/2 ⌋ 的元素。\n\n"
        "你可以假设数组是非空的，并且给定的数组总是存在多数元素。"
    ),
    "examples": [
        {"input": {"nums": [3, 2, 3]}, "output": 3},
        {"input": {"nums": [2, 2, 1, 1, 1, 2, 2]}, "output": 2},
    ],
    "constraints": [
        "n == nums.length",
        "1 <= n <= 5 * 10^4",
        "-10^9 <= nums[i] <= 10^9",
    ],
    "follow_up": "尝试设计时间复杂度为 O(n)、空间复杂度为 O(1) 的算法解决此问题。",
    "leetcode": {
        "class": "Solution",
        "method": "majorityElement",
        "params": [("nums", "List[int]")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("nums", "List[int]")],
        "output_type": "int",
        "description": "输入一行整数数组 nums（空格分隔）。输出多数元素。",
    },
    "test_cases": [
        {"input": {"nums": [3, 2, 3]}, "output": 3},
        {"input": {"nums": [2, 2, 1, 1, 1, 2, 2]}, "output": 2},
        {"input": {"nums": [1]}, "output": 1},
        {"input": {"nums": [1, 1, 1, 2, 2]}, "output": 1},
    ],
}
