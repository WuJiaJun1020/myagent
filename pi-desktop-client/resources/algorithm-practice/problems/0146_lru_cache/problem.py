PROBLEM = {
    "id": 146,
    "title": "LRU 缓存",
    "slug": "lru_cache",
    "difficulty": "medium",
    "tags": ["设计", "哈希表", "链表"],
    "description": (
        "请你设计并实现一个满足 LRU (最近最少使用) 缓存约束的数据结构。\n\n"
        "实现 LRUCache 类：\n"
        "- LRUCache(int capacity) 以正整数作为容量 capacity 初始化 LRU 缓存\n"
        "- int get(int key) 如果关键字 key 存在于缓存中，则返回关键字的值，否则返回 -1 。\n"
        "- void put(int key, int value) 如果关键字 key 已经存在，则变更其数据值 value ；如果不存在，则向缓存中插入该组 key-value 。"
        "如果插入操作导致关键字数量超过 capacity ，则应该逐出最久未使用的关键字。\n\n"
        "函数 get 和 put 必须以 O(1) 的平均时间复杂度运行。"
    ),
    "constraints": [
        "1 <= capacity <= 3000",
        "0 <= key <= 10000",
        "0 <= value <= 10^5",
        "最多调用 2 * 10^5 次 get 和 put",
    ],
    "leetcode": {
        "class": "LRUCache",
    },
    "acm": {
        "input_fields": [("operations", "JSON"), ("arguments", "JSON")],
        "output_type": "JSON",
        "description": "两行 JSON：第一行 operations（方法名数组），第二行 arguments（参数数组）。输出结果 JSON 数组（构造与 void 方法对应 null）。",
    },
    "test_cases": [
        {
            "input": {
                "operations": ["LRUCache", "put", "put", "get", "put", "get", "put", "get", "get", "get"],
                "arguments": [[2], [1, 1], [2, 2], [1], [3, 3], [2], [4, 4], [1], [3], [4]],
            },
            "output": [None, None, None, 1, None, -1, None, -1, 3, 4],
        },
        {
            "input": {
                "operations": ["LRUCache", "put", "put", "get", "put", "get"],
                "arguments": [[1], [1, 1], [2, 2], [1], [3, 3], [2]],
            },
            "output": [None, None, None, -1, None, -1],
        },
        {
            "input": {
                "operations": ["LRUCache", "put", "put", "put", "get", "get", "put", "get", "get"],
                "arguments": [[2], [1, 1], [2, 2], [1, 10], [1], [2], [3, 3], [2], [1]],
            },
            "output": [None, None, None, None, 10, 2, None, 2, -1],
        },
    ],
}
