import sys
from core.types import TreeNode


def solve():
    lines = sys.stdin.read().splitlines()
    preorder = list(map(int, lines[0].split()))
    inorder = list(map(int, lines[1].split()))

    def build(preorder, inorder):
        if not preorder:
            return None
        root = TreeNode(preorder[0])
        idx = inorder.index(preorder[0])
        root.left = build(preorder[1:1 + idx], inorder[:idx])
        root.right = build(preorder[1 + idx:], inorder[idx + 1:])
        return root

    root = build(preorder, inorder)
    print(" ".join("null" if x is None else str(x) for x in root.to_level_order()))


if __name__ == "__main__":
    solve()
