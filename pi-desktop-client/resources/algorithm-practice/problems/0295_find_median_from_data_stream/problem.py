PROBLEM = {
    "id": 295,
    "title": "数据流的中位数",
    "slug": "find_median_from_data_stream",
    "difficulty": "hard",
    "tags": ["设计", "双指针", "堆（优先队列）"],
    "description": (
        "中位数是有序整数列表中的中间值。如果列表的大小是偶数，则没有中间值，中位数是两个中间值的平均值。\n\n"
        "例如 arr = [2,3,4] 的中位数是 3 。例如 arr = [2,3] 的中位数是 (2 + 3) / 2 = 2.5 。\n\n"
        "实现 MedianFinder 类:\n"
        "- MedianFinder() 初始化 MedianFinder 对象。\n"
        "- void addNum(int num) 将数据流中的整数 num 添加到数据结构中。\n"
        "- double findMedian() 返回到目前为止所有元素的中位数。与实际答案相差 10^-5 以内的答案将被接受。"
    ),
    "constraints": [
        "-10^5 <= num <= 10^5",
        "在调用 findMedian 之前，数据结构中至少有一个元素",
        "最多调用 5 * 10^4 次 addNum 和 findMedian",
    ],
    "leetcode": {
        "class": "MedianFinder",
    },
    "acm": {
        "input_fields": [("operations", "JSON"), ("arguments", "JSON")],
        "output_type": "JSON",
        "description": "两行 JSON：第一行 operations（方法名数组），第二行 arguments（参数数组）。输出结果 JSON 数组。",
    },
    "test_cases": [
        {
            "input": {
                "operations": ["MedianFinder", "addNum", "addNum", "findMedian", "addNum", "findMedian"],
                "arguments": [[], [1], [2], [], [3], []],
            },
            "output": [None, None, None, 1.5, None, 2.0],
        },
        {
            "input": {
                "operations": ["MedianFinder", "addNum", "addNum", "findMedian", "addNum", "findMedian", "addNum", "findMedian"],
                "arguments": [[], [1], [2], [], [3], [], [3], []],
            },
            "output": [None, None, None, 1.5, None, 2.0, None, 2.5],
        },
        {
            "input": {
                "operations": ["MedianFinder", "addNum", "findMedian", "addNum", "findMedian", "addNum", "findMedian"],
                "arguments": [[], [-1], [], [-2], [], [-3], []],
            },
            "output": [None, None, -1.0, None, -1.5, None, -2.0],
        },
    ],
}
