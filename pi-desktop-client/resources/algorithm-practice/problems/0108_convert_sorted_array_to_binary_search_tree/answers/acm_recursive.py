import sys
from core.types import TreeNode


def solve():
    nums = list(map(int, sys.stdin.read().split()))

    def build(l, r):
        if l > r:
            return None
        mid = (l + r) // 2
        root = TreeNode(nums[mid])
        root.left = build(l, mid - 1)
        root.right = build(mid + 1, r)
        return root

    root = build(0, len(nums) - 1)
    res = []

    def inorder(node):
        if not node:
            return
        inorder(node.left)
        res.append(node.val)
        inorder(node.right)

    inorder(root)
    print(" ".join(map(str, res)))


if __name__ == "__main__":
    solve()
