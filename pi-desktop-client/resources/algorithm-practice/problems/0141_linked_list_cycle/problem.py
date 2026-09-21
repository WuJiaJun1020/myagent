from core.types import make_cycle


def _build_input(inp):
    # 力扣模式：由 values + pos 构造可能带环的链表
    return {"head": make_cycle(inp["values"], inp["pos"])}


PROBLEM = {
    "id": 141,
    "title": "环形链表",
    "slug": "linked_list_cycle",
    "difficulty": "easy",
    "tags": ["链表", "双指针"],
    "description": (
        "给你一个链表的头节点 head ，判断链表中是否有环。\n\n"
        "如果链表中有某个节点，可以通过连续跟踪 next 指针再次到达，则链表中存在环。"
        "为了表示给定链表中的环，评测系统内部使用整数 pos 来表示链表尾连接到链表中的位置（索引从 0 开始）。"
        "注意：pos 不作为参数进行传递。仅仅是为了标识链表的实际情况。\n\n"
        "如果链表中存在环，则返回 true 。否则，返回 false 。"
    ),
    "examples": [
        {"input": {"values": [3, 2, 0, -4], "pos": 1}, "output": True,
         "explanation": "链表中有一个环，其尾部连接到第二个节点。"},
        {"input": {"values": [1, 2], "pos": 0}, "output": True,
         "explanation": "链表中有一个环，其尾部连接到第一个节点。"},
        {"input": {"values": [1], "pos": -1}, "output": False,
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
        "method": "hasCycle",
        "params": [("head", "ListNode")],
        "return": "bool",
    },
    "build_input": _build_input,
    "acm": {
        "input_fields": [("values", "List[int]"), ("pos", "int")],
        "output_type": "bool",
        "description": "第一行：链表节点值（空格分隔，可空）；第二行：pos（尾节点指向的索引，-1 表示无环）。输出 true 或 false（小写）。",
    },
    "test_cases": [
        {"input": {"values": [3, 2, 0, -4], "pos": 1}, "output": True},
        {"input": {"values": [1, 2], "pos": 0}, "output": True},
        {"input": {"values": [1], "pos": -1}, "output": False},
        {"input": {"values": [], "pos": -1}, "output": False},
        {"input": {"values": [1, 2, 3, 4], "pos": -1}, "output": False},
        {"input": {"values": [1, 2], "pos": -1}, "output": False},
    ],
}
