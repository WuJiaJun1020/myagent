from core.types import ListNode

PROBLEM = {
    "id": 25,
    "title": "K 个一组翻转链表",
    "slug": "reverse_nodes_in_k_group",
    "difficulty": "hard",
    "tags": ["链表", "递归"],
    "description": "给你链表的头节点 head ，每 k 个节点一组进行翻转，请你返回修改后的链表。\n\nk 是一个正整数，它的值小于或等于链表的长度。如果节点总数不是 k 的整数倍，那么请将最后剩余的节点保持原有顺序。\n\n你不能只是单纯的改变节点内部的值，而是需要实际进行节点交换。",
    "examples": [
        {"input": {"head": ListNode.from_list([1, 2, 3, 4, 5]), "k": 2}, "output": ListNode.from_list([2, 1, 4, 3, 5])},
        {"input": {"head": ListNode.from_list([1, 2, 3, 4, 5]), "k": 3}, "output": ListNode.from_list([3, 2, 1, 4, 5])},
    ],
    "constraints": [
        "链表中的节点数目为 n",
        "1 <= k <= n <= 5000",
        "0 <= Node.val <= 1000",
    ],
    "follow_up": "你可以设计一个只用 O(1) 额外内存空间的算法解决此问题吗？",
    "leetcode": {
        "class": "Solution",
        "method": "reverseKGroup",
        "params": [("head", "ListNode"), ("k", "int")],
        "return": "ListNode",
    },
    "acm": {
        "input_fields": [("head", "ListNode"), ("k", "int")],
        "output_type": "ListNode",
        "description": "第一行：链表节点值（空格分隔）；第二行：k。输出翻转后链表节点值。",
    },
    "test_cases": [
        {"input": {"head": ListNode.from_list([1, 2, 3, 4, 5]), "k": 2}, "output": ListNode.from_list([2, 1, 4, 3, 5])},
        {"input": {"head": ListNode.from_list([1, 2, 3, 4, 5]), "k": 3}, "output": ListNode.from_list([3, 2, 1, 4, 5])},
        {"input": {"head": ListNode.from_list([1]), "k": 1}, "output": ListNode.from_list([1])},
        {"input": {"head": ListNode.from_list([1, 2, 3, 4]), "k": 2}, "output": ListNode.from_list([2, 1, 4, 3])},
    ],
}
