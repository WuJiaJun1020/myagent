from core.types import make_cycle


def _build_input(inp):
    return {"head": make_cycle(inp["values"], inp["pos"])}


def _resolve(actual, inp_copy):
    # actual 为返回的入环节点（或 None），转成其在链表中的索引；无环返回 -1
    if actual is None:
        return -1
    idx = 0
    cur = inp_copy["head"]
    while cur and cur is not actual:
        cur = cur.next
        idx += 1
    return idx if cur is actual else -1


PROBLEM = {
    "id": 142,
    "title": "环形链表 II",
    "slug": "linked_list_cycle_ii",
    "difficulty": "medium",
    "tags": ["链表", "双指针"],
    "description": (
        "给定一个链表的头节点 head ，返回链表开始入环的第一个节点。如果链表无环，则返回 null。\n\n"
        "如果链表中有某个节点，可以通过连续跟踪 next 指针再次到达，则链表中存在环。为了表示给定链表中的环，"
        "评测系统内部使用整数 pos 来表示链表尾连接到链表中的位置（索引从 0 开始）。如果 pos 是 -1，则在该链表中没有环。"
        "注意：pos 不作为参数进行传递，仅仅是为了标识链表的实际情况。\n\n"
        "不允许修改链表。"
    ),
    "examples": [
        {"input": {"values": [3, 2, 0, -4], "pos": 1}, "output": 1,
         "explanation": "链表中有一个环，其尾部连接到第二个节点。"},
        {"input": {"values": [1, 2], "pos": 0}, "output": 0,
         "explanation": "链表中有一个环，其尾部连接到第一个节点。"},
        {"input": {"values": [1], "pos": -1}, "output": -1,
         "explanation": "链表中没有环。"},
    ],
    "constraints": [
        "链表中节点的数目范围是 [0, 10^4]",
        "-10^5 <= Node.val <= 10^5",
        "pos 为 -1 或者链表中的一个 有效索引",
    ],
    "follow_up": "你能用 O(1)（即，常量）内存解决此问题吗？",
    "leetcode": {
        "class": "Solution",
        "method": "detectCycle",
        "params": [("head", "ListNode")],
        "return": "ListNode",
    },
    "build_input": _build_input,
    "resolve_answer": _resolve,
    "acm": {
        "input_fields": [("values", "List[int]"), ("pos", "int")],
        "output_type": "int",
        "description": "第一行：链表节点值（空格分隔）；第二行：pos（尾节点指向的索引，-1 表示无环）。输出入环节点的索引，无环输出 -1。",
    },
    "test_cases": [
        {"input": {"values": [3, 2, 0, -4], "pos": 1}, "output": 1},
        {"input": {"values": [1, 2], "pos": 0}, "output": 0},
        {"input": {"values": [1], "pos": -1}, "output": -1},
        {"input": {"values": [1, 2, 3, 4], "pos": 1}, "output": 1},
        {"input": {"values": [1, 2, 3, 4, 5], "pos": -1}, "output": -1},
    ],
}
