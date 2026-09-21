PROBLEM = {
    "id": 4,
    "title": "寻找两个正序数组的中位数",
    "slug": "median_of_two_sorted_arrays",
    "difficulty": "hard",
    "tags": ["数组", "二分查找", "分治"],
    "description": "给定两个大小分别为 m 和 n 的正序（从小到大）数组 nums1 和 nums2。请你找出并返回这两个正序数组的中位数。\n\n算法的时间复杂度应该为 O(log (m+n))。",
    "examples": [
        {"input": {"nums1": [1, 3], "nums2": [2]}, "output": 2.0},
        {"input": {"nums1": [1, 2], "nums2": [3, 4]}, "output": 2.5},
    ],
    "constraints": [
        "nums1.length == m",
        "nums2.length == n",
        "0 <= m <= 1000",
        "0 <= n <= 1000",
        "1 <= m + n <= 2000",
        "-10^6 <= nums1[i], nums2[i] <= 10^6",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "findMedianSortedArrays",
        "params": [("nums1", "List[int]"), ("nums2", "List[int]")],
        "return": "float",
    },
    "acm": {
        "input_fields": [("nums1", "List[int]"), ("nums2", "List[int]")],
        "output_type": "float",
        "description": "第一行：nums1（空格分隔，可为空）；第二行：nums2（空格分隔，可为空）。输出中位数。",
    },
    "test_cases": [
        {"input": {"nums1": [1, 3], "nums2": [2]}, "output": 2.0},
        {"input": {"nums1": [1, 2], "nums2": [3, 4]}, "output": 2.5},
        {"input": {"nums1": [0, 0], "nums2": [0, 0]}, "output": 0.0},
        {"input": {"nums1": [], "nums2": [1]}, "output": 1.0},
        {"input": {"nums1": [2], "nums2": []}, "output": 2.0},
    ],
}
