from core.types import ListNode

PROBLEM = {
    "id": 234,
    "title": "回文链表",
    "slug": "palindrome_linked_list",
    "difficulty": "easy",
    "tags": ["链表", "双指针"],
    "description": "给你一个单链表的头节点 head ，请你判断该链表是否为回文链表。如果是，返回 true ；否则，返回 false 。",
    "examples": [
        {"input": {"head": ListNode.from_list([1, 2, 2, 1])}, "output": True},
        {"input": {"head": ListNode.from_list([1, 2])}, "output": False},
    ],
    "constraints": [
        "链表中节点数目在范围 [1, 10^5] 内",
        "0 <= Node.val <= 9",
    ],
    "follow_up": "你能否用 O(n) 时间复杂度和 O(1) 空间复杂度解决此题？",
    "leetcode": {
        "class": "Solution",
        "method": "isPalindrome",
        "params": [("head", "ListNode")],
        "return": "bool",
    },
    "acm": {
        "input_fields": [("head", "ListNode")],
        "output_type": "bool",
        "description": "输入一行链表节点值（空格分隔，null 表示空链表）。输出 true 或 false（小写）。",
    },
    "test_cases": [
        {"input": {"head": ListNode.from_list([1, 2, 2, 1])}, "output": True},
        {"input": {"head": ListNode.from_list([1, 2])}, "output": False},
        {"input": {"head": ListNode.from_list([1])}, "output": True},
        {"input": {"head": ListNode.from_list([1, 2, 1])}, "output": True},
        {"input": {"head": ListNode.from_list([1, 2, 2, 1, 3])}, "output": False},
    ],
}
