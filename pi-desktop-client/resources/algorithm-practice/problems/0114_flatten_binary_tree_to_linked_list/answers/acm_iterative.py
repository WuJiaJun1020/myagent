import sys
from core.types import treenode_from_str


def solve():
    root = treenode_from_str(sys.stdin.read().strip())
    cur = root
    while cur:
        if cur.left:
            predecessor = cur.left
            while predecessor.right:
                predecessor = predecessor.right
            predecessor.right = cur.right
            cur.right = cur.left
            cur.left = None
        cur = cur.right
    if root is None:
        print("null")
    else:
        print(" ".join("null" if x is None else str(x) for x in root.to_level_order()))


if __name__ == "__main__":
    solve()
