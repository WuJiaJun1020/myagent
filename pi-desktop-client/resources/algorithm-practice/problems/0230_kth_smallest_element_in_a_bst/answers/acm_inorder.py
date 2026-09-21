import sys
from core.types import treenode_from_str


def solve():
    lines = sys.stdin.read().splitlines()
    root = treenode_from_str(lines[0])
    k = int(lines[1])
    res = []

    def inorder(node):
        if not node:
            return
        inorder(node.left)
        res.append(node.val)
        inorder(node.right)

    inorder(root)
    print(res[k - 1])


if __name__ == "__main__":
    solve()
