"""结果比较：类型感知地判断实际输出与期望输出是否相等。"""
from core.types import ListNode, TreeNode


def values_equal(a, b, eps=1e-6):
    """递归比较两个结构化值（int/str/bool/float/list/ListNode/TreeNode）。"""
    if isinstance(a, ListNode) or isinstance(b, ListNode):
        if not (isinstance(a, ListNode) and isinstance(b, ListNode)):
            return False
        return a.to_list() == b.to_list()
    if isinstance(a, TreeNode) or isinstance(b, TreeNode):
        if not (isinstance(a, TreeNode) and isinstance(b, TreeNode)):
            return False
        return a.to_level_order() == b.to_level_order()
    if isinstance(a, list) or isinstance(b, list):
        if not (isinstance(a, list) and isinstance(b, list)):
            return False
        if len(a) != len(b):
            return False
        return all(values_equal(x, y, eps) for x, y in zip(a, b))
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b
    if isinstance(a, float) or isinstance(b, float):
        return abs(a - b) < eps
    return a == b


def normalize_stdout(s):
    """归一化 stdout：去掉首尾空行、每行去尾部空白。"""
    lines = [ln.rstrip() for ln in s.strip().splitlines()]
    return "\n".join(lines)
