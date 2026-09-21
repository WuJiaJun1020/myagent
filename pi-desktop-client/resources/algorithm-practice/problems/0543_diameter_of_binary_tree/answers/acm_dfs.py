import sys
from core.types import treenode_from_str


def solve():
    root = treenode_from_str(sys.stdin.read().strip())
    ans = 0

    def depth(node):
        nonlocal ans
        if not node:
            return 0
        left = depth(node.left)
        right = depth(node.right)
        ans = max(ans, left + right)
        return 1 + max(left, right)

    depth(root)
    print(ans)


if __name__ == "__main__":
    solve()
