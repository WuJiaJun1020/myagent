"""核心数据结构与 ACM 序列化工具。

所有测试用例都以「结构化数据」的形式存放在 problem.py 里（比如链表用
ListNode.from_list([...]) 构造、树用 TreeNode.from_level_order([...]) 构造），
因此评测器只需要「结构化值 -> 字符串」这一个方向的序列化，用来喂给 ACM 模式的
stdin / 生成期望的 stdout。
"""
import json
from collections import deque


class ListNode:
    """单链表节点。"""

    def __init__(self, val=0, nxt=None):
        self.val = val
        self.next = nxt

    @classmethod
    def from_list(cls, vals):
        if not vals:
            return None
        dummy = cls()
        cur = dummy
        for v in vals:
            cur.next = cls(v)
            cur = cur.next
        return dummy.next

    def to_list(self):
        out = []
        seen = set()
        cur = self
        while cur and id(cur) not in seen:
            seen.add(id(cur))
            out.append(cur.val)
            cur = cur.next
        return out


class TreeNode:
    """二叉树节点。"""

    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

    @classmethod
    def from_level_order(cls, vals):
        """按层序遍历数组构造树，None 表示空节点；空数组或首元素为 None 表示空树。"""
        if not vals or vals[0] is None:
            return None
        root = cls(vals[0])
        q = deque([root])
        i = 1
        while i < len(vals):
            node = q.popleft()
            if i < len(vals) and vals[i] is not None:
                node.left = cls(vals[i])
                q.append(node.left)
            i += 1
            if i < len(vals) and vals[i] is not None:
                node.right = cls(vals[i])
                q.append(node.right)
            i += 1
        return root

    def to_level_order(self):
        """返回层序遍历数组（去掉尾部多余的 None）。"""
        out = []
        q = deque([self])
        while q:
            node = q.popleft()
            if node is None:
                out.append(None)
                continue
            out.append(node.val)
            q.append(node.left)
            q.append(node.right)
        while out and out[-1] is None:
            out.pop()
        return out


def make_cycle(values, pos):
    """构造可能带环的链表，pos 为尾节点指向的索引，-1 表示无环。"""
    if not values:
        return None
    nodes = [ListNode(v) for v in values]
    for i in range(len(nodes) - 1):
        nodes[i].next = nodes[i + 1]
    if pos >= 0:
        nodes[-1].next = nodes[pos]
    return nodes[0]


def listnode_from_str(s):
    """ACM 模式读取链表：\"null\" 或空串表示空链表。"""
    s = s.strip()
    if s in ("", "null"):
        return None
    dummy = ListNode(0)
    cur = dummy
    for v in map(int, s.split()):
        cur.next = ListNode(v)
        cur = cur.next
    return dummy.next


def treenode_from_str(s):
    """ACM 模式读取树：\"null\" 或空串表示空树，其余为层序遍历（null 表示空节点）。"""
    s = s.strip()
    if s in ("", "null"):
        return None
    vals = [None if t == "null" else int(t) for t in s.split()]
    return TreeNode.from_level_order(vals)


def build_intersecting_lists(list_a, list_b, skip_a, skip_b):
    """构造两个相交链表。skip_a/skip_b 为各自到交点的前缀长度；<0 表示不相交。"""

    def build(vals):
        dummy = ListNode(0)
        cur = dummy
        for v in vals:
            cur.next = ListNode(v)
            cur = cur.next
        return dummy.next

    def concat(prefix_vals, tail):
        head = build(prefix_vals)
        if not head:
            return tail
        cur = head
        while cur.next:
            cur = cur.next
        cur.next = tail
        return head

    if skip_a < 0:
        return build(list_a), build(list_b)
    shared = build(list_a[skip_a:])
    return concat(list_a[:skip_a], shared), concat(list_b[:skip_b], shared)


class RandomListNode:
    """带随机指针的链表节点。"""

    def __init__(self, val=0, nxt=None, random=None):
        self.val = val
        self.next = nxt
        self.random = random


def build_random_list(data):
    """由 [[val, random_index], ...] 构造带随机指针的链表，random_index 为 None 表示 null。"""
    if not data:
        return None
    nodes = [RandomListNode(val) for val, _ in data]
    for i, (_, rand_idx) in enumerate(data):
        if i + 1 < len(nodes):
            nodes[i].next = nodes[i + 1]
        if rand_idx is not None:
            nodes[i].random = nodes[rand_idx]
    return nodes[0]


def random_list_to_data(head):
    """把带随机指针的链表转成 [[val, random_index], ...]。"""
    if head is None:
        return []
    nodes = []
    cur = head
    while cur:
        nodes.append(cur)
        cur = cur.next
    idx = {id(node): i for i, node in enumerate(nodes)}
    return [[node.val, None if node.random is None else idx[id(node.random)]] for node in nodes]


def to_acm_string(value, type_str):
    """把结构化值按类型序列化成 ACM 模式的字符串（可能含换行）。"""
    if type_str == "int":
        return str(value)
    if type_str == "float":
        return repr(value)
    if type_str == "bool":
        return "true" if value else "false"
    if type_str == "str":
        return value
    if type_str == "JSON":
        return json.dumps(value, ensure_ascii=False)
    if type_str == "List[int]":
        return " ".join(map(str, value))
    if type_str == "List[float]":
        return " ".join(repr(v) for v in value)
    if type_str == "List[str]":
        return " ".join(value)
    if type_str == "List[List[int]]":
        return "\n".join(" ".join(map(str, row)) for row in value)
    if type_str == "List[List[str]]":
        return "\n".join(" ".join(row) for row in value)
    if type_str == "ListNode":
        if value is None:
            return "null"
        return " ".join(map(str, value.to_list()))
    if type_str == "List[ListNode]":
        return "\n".join("null" if lst is None else " ".join(map(str, lst.to_list())) for lst in value)
    if type_str == "TreeNode":
        if value is None:
            return "null"
        return " ".join("null" if x is None else str(x) for x in value.to_level_order())
    raise ValueError(f"不支持的序列化类型: {type_str}")


def fmt_value(v):
    """把 ListNode/TreeNode 等转成可读的 Python 原生结构，用于打印。"""
    if isinstance(v, ListNode):
        return v.to_list()
    if isinstance(v, TreeNode):
        return v.to_level_order()
    if isinstance(v, list):
        return [fmt_value(x) for x in v]
    return v
