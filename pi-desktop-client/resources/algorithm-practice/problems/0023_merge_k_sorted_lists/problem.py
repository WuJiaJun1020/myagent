from core.types import ListNode

PROBLEM = {
    "id": 23,
    "title": "合并K个升序链表",
    "slug": "merge_k_sorted_lists",
    "difficulty": "hard",
    "tags": ["链表", "分治", "堆（优先队列）", "归并排序"],
    "description": "给你一个链表数组，每个链表都已经按升序排列。\n\n请你将所有链表合并到一个升序链表中，返回合并后的链表。",
    "examples": [
        {"input": {"lists": [ListNode.from_list([1, 4, 5]), ListNode.from_list([1, 3, 4]), ListNode.from_list([2, 6])]},
         "output": ListNode.from_list([1, 1, 2, 3, 4, 4, 5, 6])},
        {"input": {"lists": []}, "output": ListNode.from_list([])},
        {"input": {"lists": [ListNode.from_list([])]}, "output": ListNode.from_list([])},
    ],
    "constraints": [
        "k == lists.length",
        "0 <= k <= 10^4",
        "0 <= lists[i].length <= 500",
        "-10^4 <= lists[i][j] <= 10^4",
        "lists[i] 按升序排列",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "mergeKLists",
        "params": [("lists", "List[ListNode]")],
        "return": "ListNode",
    },
    "acm": {
        "input_fields": [("lists", "List[ListNode]")],
        "output_type": "ListNode",
        "description": "输入每行一个链表（空格分隔，null 表示空链表）。输出合并后链表节点值。",
    },
    "test_cases": [
        {"input": {"lists": [ListNode.from_list([1, 4, 5]), ListNode.from_list([1, 3, 4]), ListNode.from_list([2, 6])]},
         "output": ListNode.from_list([1, 1, 2, 3, 4, 4, 5, 6])},
        {"input": {"lists": []}, "output": ListNode.from_list([])},
        {"input": {"lists": [ListNode.from_list([])]}, "output": ListNode.from_list([])},
        {"input": {"lists": [ListNode.from_list([1]), ListNode.from_list([2])]}, "output": ListNode.from_list([1, 2])},
    ],
}
