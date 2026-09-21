from core.types import ListNode

PROBLEM = {
    "id": 19,
    "title": "删除链表的倒数第 N 个结点",
    "slug": "remove_nth_node_from_end_of_list",
    "difficulty": "medium",
    "tags": ["链表", "双指针"],
    "description": "给你一个链表，删除链表的倒数第 n 个结点，并且返回链表的头结点。",
    "examples": [
        {"input": {"head": ListNode.from_list([1, 2, 3, 4, 5]), "n": 2},
         "output": ListNode.from_list([1, 2, 3, 5])},
        {"input": {"head": ListNode.from_list([1]), "n": 1},
         "output": ListNode.from_list([])},
        {"input": {"head": ListNode.from_list([1, 2]), "n": 1},
         "output": ListNode.from_list([1])},
    ],
    "constraints": [
        "链表中结点的数目为 sz",
        "1 <= sz <= 30",
        "0 <= Node.val <= 100",
        "1 <= n <= sz",
    ],
    "follow_up": "你能尝试使用一趟扫描实现吗？",
    "leetcode": {
        "class": "Solution",
        "method": "removeNthFromEnd",
        "params": [("head", "ListNode"), ("n", "int")],
        "return": "ListNode",
    },
    "acm": {
        "input_fields": [("head", "ListNode"), ("n", "int")],
        "output_type": "ListNode",
        "description": "第一行：链表节点值（空格分隔，null 表示空链表）；第二行：n。输出删除后链表节点值。",
    },
    "test_cases": [
        {"input": {"head": ListNode.from_list([1, 2, 3, 4, 5]), "n": 2},
         "output": ListNode.from_list([1, 2, 3, 5])},
        {"input": {"head": ListNode.from_list([1]), "n": 1},
         "output": ListNode.from_list([])},
        {"input": {"head": ListNode.from_list([1, 2]), "n": 1},
         "output": ListNode.from_list([1])},
        {"input": {"head": ListNode.from_list([1, 2, 3, 4, 5]), "n": 5},
         "output": ListNode.from_list([2, 3, 4, 5])},
        {"input": {"head": ListNode.from_list([1, 2]), "n": 2},
         "output": ListNode.from_list([2])},
    ],
}
