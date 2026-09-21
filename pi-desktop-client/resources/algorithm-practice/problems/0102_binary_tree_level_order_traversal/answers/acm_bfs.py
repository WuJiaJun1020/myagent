import sys
from core.types import treenode_from_str
from collections import deque


def solve():
    root = treenode_from_str(sys.stdin.read().strip())
    if not root:
        return
    q = deque([root])
    while q:
        level = []
        for _ in range(len(q)):
            node = q.popleft()
            level.append(node.val)
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
        print(" ".join(map(str, level)))


if __name__ == "__main__":
    solve()
