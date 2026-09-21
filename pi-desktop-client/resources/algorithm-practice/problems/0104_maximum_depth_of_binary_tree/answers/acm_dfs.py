import sys
from core.types import treenode_from_str


def solve():
    root = treenode_from_str(sys.stdin.read().strip())

    def depth(node):
        return 0 if not node else 1 + max(depth(node.left), depth(node.right))

    print(depth(root))


if __name__ == "__main__":
    solve()
