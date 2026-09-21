import sys
from core.types import treenode_from_str


def solve():
    root = treenode_from_str(sys.stdin.read().strip())
    res = []

    def dfs(node):
        if not node:
            return
        dfs(node.left)
        res.append(node.val)
        dfs(node.right)

    dfs(root)
    print(" ".join(map(str, res)))


if __name__ == "__main__":
    solve()
