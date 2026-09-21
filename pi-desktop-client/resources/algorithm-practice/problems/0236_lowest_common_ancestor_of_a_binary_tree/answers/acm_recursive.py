import sys
from core.types import treenode_from_str


def solve():
    lines = sys.stdin.read().splitlines()
    root = treenode_from_str(lines[0])
    p_val = int(lines[1])
    q_val = int(lines[2])

    def find(node, val):
        if not node:
            return None
        if node.val == val:
            return node
        return find(node.left, val) or find(node.right, val)

    p = find(root, p_val)
    q = find(root, q_val)

    def lca(node):
        if not node or node is p or node is q:
            return node
        left = lca(node.left)
        right = lca(node.right)
        if left and right:
            return node
        return left or right

    print(lca(root).val)


if __name__ == "__main__":
    solve()
