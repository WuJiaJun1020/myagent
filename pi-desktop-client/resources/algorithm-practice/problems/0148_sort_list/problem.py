from core.types import ListNode

PROBLEM = {
    "id": 148,
    "title": "排序链表",
    "slug": "sort_list",
    "difficulty": "medium",
    "tags": ["链表", "双指针", "分治", "归并排序"],
    "description": "给你链表的头结点 head ，请将其按 升序 排列并返回 排序后的链表 。",
    "examples": [
        {"input": {"head": ListNode.from_list([4, 2, 1, 3])},
         "output": ListNode.from_list([1, 2, 3, 4])},
        {"input": {"head": ListNode.from_list([-1, 5, 3, 4, 0])},
         "output": ListNode.from_list([-1, 0, 3, 4, 5])},
        {"input": {"head": ListNode.from_list([])},
         "output": ListNode.from_list([])},
    ],
    "constraints": [
        "链表中节点的数目在范围 [0, 5 * 10^4] 内",
        "-10^5 <= Node.val <= 10^5",
    ],
    "follow_up": "你可以在 O(n log n) 时间复杂度和常数级空间复杂度下，对链表进行排序吗？",
    "leetcode": {
        "class": "Solution",
        "method": "sortList",
        "params": [("head", "ListNode")],
        "return": "ListNode",
    },
    "acm": {
        "input_fields": [("head", "ListNode")],
        "output_type": "ListNode",
        "description": "输入一行链表节点值（空格分隔，null 表示空链表）。输出升序排序后链表节点值。",
    },
    "test_cases": [
        {"input": {"head": ListNode.from_list([4, 2, 1, 3])},
         "output": ListNode.from_list([1, 2, 3, 4])},
        {"input": {"head": ListNode.from_list([-1, 5, 3, 4, 0])},
         "output": ListNode.from_list([-1, 0, 3, 4, 5])},
        {"input": {"head": ListNode.from_list([])},
         "output": ListNode.from_list([])},
        {"input": {"head": ListNode.from_list([2])},
         "output": ListNode.from_list([2])},
        {"input": {"head": ListNode.from_list([2, 1])},
         "output": ListNode.from_list([1, 2])},
    ],
}
