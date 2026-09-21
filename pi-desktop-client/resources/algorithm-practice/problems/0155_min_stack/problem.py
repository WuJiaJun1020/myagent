PROBLEM = {
    "id": 155,
    "title": "最小栈",
    "slug": "min_stack",
    "difficulty": "medium",
    "tags": ["栈", "设计"],
    "description": (
        "设计一个支持 push ，pop ，top 操作，并能在常数时间内检索到最小元素的栈。\n\n"
        "实现 MinStack 类:\n"
        "- MinStack() 初始化堆栈对象。\n"
        "- void push(int val) 将元素 val 推入堆栈。\n"
        "- void pop() 删除堆栈顶部的元素。\n"
        "- int top() 获取堆栈顶部的元素。\n"
        "- int getMin() 获取堆栈中的最小元素。"
    ),
    "constraints": [
        "-2^31 <= val <= 2^31 - 1",
        "pop、top 和 getMin 操作总是在非空栈上调用",
        "push、pop、top 和 getMin 最多被调用 3 * 10^4 次",
    ],
    "leetcode": {
        "class": "MinStack",
    },
    "acm": {
        "input_fields": [("operations", "JSON"), ("arguments", "JSON")],
        "output_type": "JSON",
        "description": "两行 JSON：第一行 operations（方法名数组），第二行 arguments（参数数组）。输出结果 JSON 数组。",
    },
    "test_cases": [
        {
            "input": {
                "operations": ["MinStack", "push", "push", "push", "getMin", "pop", "top", "getMin"],
                "arguments": [[], [-2], [0], [-3], [], [], [], []],
            },
            "output": [None, None, None, None, -3, None, 0, -2],
        },
        {
            "input": {
                "operations": ["MinStack", "push", "push", "push", "getMin", "pop", "getMin", "top"],
                "arguments": [[], [2], [1], [1], [], [], [], []],
            },
            "output": [None, None, None, None, 1, None, 1, 1],
        },
        {
            "input": {
                "operations": ["MinStack", "push", "push", "push", "top", "getMin", "pop", "getMin", "pop", "getMin"],
                "arguments": [[], [-3], [5], [-2], [], [], [], [], [], []],
            },
            "output": [None, None, None, None, -2, -3, None, -3, None, -3],
        },
    ],
}
