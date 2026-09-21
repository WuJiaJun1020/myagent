from core.types import ListNode

PROBLEM = {
    "id": 24,
    "title": "两两交换链表中的节点",
    "slug": "swap_nodes_in_pairs",
    "difficulty": "medium",
    "tags": ["链表", "递归"],
    "description": "给你一个链表，两两交换其中相邻的节点，并返回交换后链表的头节点。你必须在不修改节点内部的值的情况下完成本题（即，只能进行节点交换）。",
    "examples": [
        {"input": {"head": ListNode.from_list([1, 2, 3, 4])},
         "output": ListNode.from_list([2, 1, 4, 3])},
        {"input": {"head": ListNode.from_list([])},
         "output": ListNode.from_list([])},
        {"input": {"head": ListNode.from_list([1])},
         "output": ListNode.from_list([1])},
    ],
    "constraints": [
        "链表中节点的数目在范围 [0, 100] 内",
        "0 <= Node.val <= 100",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "swapPairs",
        "params": [("head", "ListNode")],
        "return": "ListNode",
    },
    "acm": {
        "input_fields": [("head", "ListNode")],
        "output_type": "ListNode",
        "description": "输入一行链表节点值（空格分隔，null 表示空链表）。输出交换后链表节点值。",
    },
    "test_cases": [
        {"input": {"head": ListNode.from_list([1, 2, 3, 4])},
         "output": ListNode.from_list([2, 1, 4, 3])},
        {"input": {"head": ListNode.from_list([])},
         "output": ListNode.from_list([])},
        {"input": {"head": ListNode.from_list([1])},
         "output": ListNode.from_list([1])},
        {"input": {"head": ListNode.from_list([1, 2, 3])},
         "output": ListNode.from_list([2, 1, 3])},
    ],
}
