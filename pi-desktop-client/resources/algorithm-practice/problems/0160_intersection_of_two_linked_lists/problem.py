from core.types import build_intersecting_lists


def _build_input(inp):
    head_a, head_b = build_intersecting_lists(inp["listA"], inp["listB"], inp["skipA"], inp["skipB"])
    return {"headA": head_a, "headB": head_b}


def _resolve(actual, inp_copy):
    # actual 为返回的交点节点（或 None），转成其在 headA 中的索引；不相交返回 -1
    if actual is None:
        return -1
    idx = 0
    cur = inp_copy["headA"]
    while cur and cur is not actual:
        cur = cur.next
        idx += 1
    return idx if cur is actual else -1


PROBLEM = {
    "id": 160,
    "title": "相交链表",
    "slug": "intersection_of_two_linked_lists",
    "difficulty": "easy",
    "tags": ["链表", "哈希表", "双指针"],
    "description": (
        "给你两个单链表的头节点 headA 和 headB ，请你找出并返回两个单链表相交的起始节点。如果两个链表不存在相交节点，返回 null 。\n\n"
        "题目数据保证整个链式结构中不存在环。\n\n"
        "注意，函数返回结果后，链表必须保持其原始结构。"
    ),
    "examples": [
        {"input": {"listA": [4, 1, 8, 4, 5], "listB": [5, 6, 1, 8, 4, 5], "skipA": 2, "skipB": 3}, "output": 2,
         "explanation": "相交节点的值为 8（在 listA 中的索引为 2）。"},
        {"input": {"listA": [1, 9, 1, 2, 4], "listB": [3, 2, 4], "skipA": 3, "skipB": 1}, "output": 3,
         "explanation": "相交节点的值为 2（在 listA 中的索引为 3）。"},
        {"input": {"listA": [2, 6, 4], "listB": [1, 5], "skipA": -1, "skipB": -1}, "output": -1,
         "explanation": "两个链表不相交。"},
    ],
    "constraints": [
        "listA 中节点数目为 m，listB 中节点数目为 n",
        "1 <= m, n <= 3 * 10^4",
        "1 <= Node.val <= 10^5",
        "0 <= skipA <= m，0 <= skipB <= n（skipA = -1 表示不相交）",
    ],
    "follow_up": "你能否设计一个时间复杂度 O(m + n) 、仅用 O(1) 内存的解决方案？",
    "leetcode": {
        "class": "Solution",
        "method": "getIntersectionNode",
        "params": [("headA", "ListNode"), ("headB", "ListNode")],
        "return": "ListNode",
    },
    "build_input": _build_input,
    "resolve_answer": _resolve,
    "acm": {
        "input_fields": [("listA", "List[int]"), ("listB", "List[int]"), ("skipA", "int"), ("skipB", "int")],
        "output_type": "int",
        "description": "四行：listA（空格分隔）、listB（空格分隔）、skipA、skipB（-1 表示不相交）。输出交点在 listA 中的索引，不相交输出 -1。",
    },
    "test_cases": [
        {"input": {"listA": [4, 1, 8, 4, 5], "listB": [5, 6, 1, 8, 4, 5], "skipA": 2, "skipB": 3}, "output": 2},
        {"input": {"listA": [1, 9, 1, 2, 4], "listB": [3, 2, 4], "skipA": 3, "skipB": 1}, "output": 3},
        {"input": {"listA": [2, 6, 4], "listB": [1, 5], "skipA": -1, "skipB": -1}, "output": -1},
        {"input": {"listA": [1], "listB": [1], "skipA": 0, "skipB": 0}, "output": 0},
    ],
}
