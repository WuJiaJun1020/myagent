import sys
from core.types import treenode_from_str


def solve():
    root = treenode_from_str(sys.stdin.read().strip())

    def invert(node):
        if not node:
            return None
        node.left, node.right = invert(node.right), invert(node.left)
        return node

    root = invert(root)
    if root is None:
        print("null")
    else:
        print(" ".join("null" if x is None else str(x) for x in root.to_level_order()))


if __name__ == "__main__":
    solve()
