from core.types import ListNode

PROBLEM = {
    "id": 21,
    "title": "合并两个有序链表",
    "slug": "merge_two_sorted_lists",
    "difficulty": "easy",
    "tags": ["链表", "递归"],
    "description": "将两个升序链表合并为一个新的 升序 链表并返回。新链表是通过拼接给定的两个链表的所有节点组成的。",
    "examples": [
        {"input": {"list1": ListNode.from_list([1, 2, 4]), "list2": ListNode.from_list([1, 3, 4])},
         "output": ListNode.from_list([1, 1, 2, 3, 4, 4])},
        {"input": {"list1": ListNode.from_list([]), "list2": ListNode.from_list([])},
         "output": ListNode.from_list([])},
        {"input": {"list1": ListNode.from_list([]), "list2": ListNode.from_list([0])},
         "output": ListNode.from_list([0])},
    ],
    "constraints": [
        "两个链表的节点数目范围是 [0, 50]",
        "-100 <= Node.val <= 100",
        "list1 和 list2 均按 非递减顺序 排列",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "mergeTwoLists",
        "params": [("list1", "ListNode"), ("list2", "ListNode")],
        "return": "ListNode",
    },
    "acm": {
        "input_fields": [("list1", "ListNode"), ("list2", "ListNode")],
        "output_type": "ListNode",
        "description": "两行，各是一个升序链表的节点值（空格分隔，\"null\" 表示空链表）。输出合并后链表节点值。",
    },
    "test_cases": [
        {"input": {"list1": ListNode.from_list([1, 2, 4]), "list2": ListNode.from_list([1, 3, 4])}, "output": ListNode.from_list([1, 1, 2, 3, 4, 4])},
        {"input": {"list1": ListNode.from_list([]), "list2": ListNode.from_list([])}, "output": ListNode.from_list([])},
        {"input": {"list1": ListNode.from_list([]), "list2": ListNode.from_list([0])}, "output": ListNode.from_list([0])},
        {"input": {"list1": ListNode.from_list([5]), "list2": ListNode.from_list([1, 2, 4])}, "output": ListNode.from_list([1, 2, 4, 5])},
        {"input": {"list1": ListNode.from_list([2]), "list2": ListNode.from_list([1])}, "output": ListNode.from_list([1, 2])},
    ],
}
