import sys
from core.types import treenode_from_str
from collections import deque


def solve():
    root = treenode_from_str(sys.stdin.read().strip())
    if not root:
        return
    res = []
    q = deque([root])
    while q:
        level = len(q)
        for i in range(level):
            node = q.popleft()
            if i == level - 1:
                res.append(node.val)
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
    print(" ".join(map(str, res)))


if __name__ == "__main__":
    solve()
