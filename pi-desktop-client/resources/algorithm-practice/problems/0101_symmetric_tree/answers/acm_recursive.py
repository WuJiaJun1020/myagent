import sys
from core.types import treenode_from_str


def solve():
    root = treenode_from_str(sys.stdin.read().strip())

    def mirror(a, b):
        if not a and not b:
            return True
        if not a or not b or a.val != b.val:
            return False
        return mirror(a.left, b.right) and mirror(a.right, b.left)

    print("true" if mirror(root, root) else "false")


if __name__ == "__main__":
    solve()
