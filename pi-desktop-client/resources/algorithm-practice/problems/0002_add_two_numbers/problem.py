from core.types import ListNode

PROBLEM = {
    "id": 2,
    "title": "两数相加",
    "slug": "add_two_numbers",
    "difficulty": "medium",
    "tags": ["链表", "数学"],
    "description": (
        "给你两个 非空 的链表，表示两个非负的整数。它们每位数字都是按照 逆序 的方式存储的，"
        "并且每个节点只能存储 一位 数字。\n\n"
        "请你将两个数相加，并以相同形式返回一个表示和的链表。\n\n"
        "你可以假设除了数字 0 之外，这两个数都不会以 0 开头。"
    ),
    "examples": [
        {"input": {"l1": ListNode.from_list([2, 4, 3]), "l2": ListNode.from_list([5, 6, 4])},
         "output": ListNode.from_list([7, 0, 8]), "explanation": "342 + 465 = 807"},
        {"input": {"l1": ListNode.from_list([0]), "l2": ListNode.from_list([0])},
         "output": ListNode.from_list([0])},
        {"input": {"l1": ListNode.from_list([9, 9, 9, 9, 9, 9, 9]), "l2": ListNode.from_list([9, 9, 9, 9])},
         "output": ListNode.from_list([8, 9, 9, 9, 0, 0, 0, 1])},
    ],
    "constraints": [
        "每个链表中的节点数在范围 [1, 100] 内",
        "0 <= Node.val <= 9",
        "题目数据保证列表表示的数字不含前导零",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "addTwoNumbers",
        "params": [("l1", "ListNode"), ("l2", "ListNode")],
        "return": "ListNode",
    },
    "acm": {
        "input_fields": [("l1", "ListNode"), ("l2", "ListNode")],
        "output_type": "ListNode",
        "description": "两行，各是一个链表的节点值（空格分隔，\"null\" 表示空链表）。输出结果链表节点值。",
    },
    "test_cases": [
        {"input": {"l1": ListNode.from_list([2, 4, 3]), "l2": ListNode.from_list([5, 6, 4])}, "output": ListNode.from_list([7, 0, 8])},
        {"input": {"l1": ListNode.from_list([0]), "l2": ListNode.from_list([0])}, "output": ListNode.from_list([0])},
        {"input": {"l1": ListNode.from_list([9, 9, 9, 9, 9, 9, 9]), "l2": ListNode.from_list([9, 9, 9, 9])}, "output": ListNode.from_list([8, 9, 9, 9, 0, 0, 0, 1])},
        {"input": {"l1": ListNode.from_list([2, 4, 9]), "l2": ListNode.from_list([5, 6, 4, 9])}, "output": ListNode.from_list([7, 0, 4, 0, 1])},
        {"input": {"l1": ListNode.from_list([5]), "l2": ListNode.from_list([5])}, "output": ListNode.from_list([0, 1])},
    ],
}
