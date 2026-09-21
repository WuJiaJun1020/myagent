import sys
from collections import defaultdict
from core.types import treenode_from_str


def solve():
    lines = sys.stdin.read().splitlines()
    root = treenode_from_str(lines[0])
    targetSum = int(lines[1])
    count = 0
    prefix = defaultdict(int)
    prefix[0] = 1

    def dfs(node, cur_sum):
        nonlocal count
        if not node:
            return
        cur_sum += node.val
        count += prefix[cur_sum - targetSum]
        prefix[cur_sum] += 1
        dfs(node.left, cur_sum)
        dfs(node.right, cur_sum)
        prefix[cur_sum] -= 1

    dfs(root, 0)
    print(count)


if __name__ == "__main__":
    solve()
