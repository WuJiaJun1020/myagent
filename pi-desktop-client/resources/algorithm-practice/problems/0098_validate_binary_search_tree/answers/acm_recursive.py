import sys
from core.types import treenode_from_str


def solve():
    root = treenode_from_str(sys.stdin.read().strip())

    def dfs(node, lo, hi):
        if not node:
            return True
        if not (lo < node.val < hi):
            return False
        return dfs(node.left, lo, node.val) and dfs(node.right, node.val, hi)

    print("true" if dfs(root, float("-inf"), float("inf")) else "false")


if __name__ == "__main__":
    solve()
