from core.types import ListNode

PROBLEM = {
    "id": 206,
    "title": "反转链表",
    "slug": "reverse_linked_list",
    "difficulty": "easy",
    "tags": ["链表", "递归"],
    "description": "给你单链表的头节点 head ，请你反转链表，并返回反转后的链表。",
    "examples": [
        {"input": {"head": ListNode.from_list([1, 2, 3, 4, 5])}, "output": ListNode.from_list([5, 4, 3, 2, 1])},
        {"input": {"head": ListNode.from_list([1, 2])}, "output": ListNode.from_list([2, 1])},
        {"input": {"head": ListNode.from_list([])}, "output": ListNode.from_list([])},
    ],
    "constraints": [
        "链表中节点的数目范围是 [0, 5000]",
        "-5000 <= Node.val <= 5000",
    ],
    "follow_up": "链表可以选用迭代或递归方式完成反转。你能否用两种方法解决这道题？",
    "leetcode": {
        "class": "Solution",
        "method": "reverseList",
        "params": [("head", "ListNode")],
        "return": "ListNode",
    },
    "acm": {
        "input_fields": [("head", "ListNode")],
        "output_type": "ListNode",
        "description": "输入一行链表节点值（空格分隔，\"null\" 表示空链表）。输出反转后的链表节点值。",
    },
    "test_cases": [
        {"input": {"head": ListNode.from_list([1, 2, 3, 4, 5])}, "output": ListNode.from_list([5, 4, 3, 2, 1])},
        {"input": {"head": ListNode.from_list([1, 2])}, "output": ListNode.from_list([2, 1])},
        {"input": {"head": ListNode.from_list([])}, "output": ListNode.from_list([])},
        {"input": {"head": ListNode.from_list([1])}, "output": ListNode.from_list([1])},
    ],
}
