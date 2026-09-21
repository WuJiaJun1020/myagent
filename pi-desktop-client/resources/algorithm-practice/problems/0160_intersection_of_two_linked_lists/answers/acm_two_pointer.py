import sys
from core.types import build_intersecting_lists


def solve():
    lines = sys.stdin.read().splitlines()
    list_a = list(map(int, lines[0].split()))
    list_b = list(map(int, lines[1].split()))
    skip_a = int(lines[2])
    skip_b = int(lines[3])
    head_a, head_b = build_intersecting_lists(list_a, list_b, skip_a, skip_b)

    a, b = head_a, head_b
    while a is not b:
        a = a.next if a else head_b
        b = b.next if b else head_a

    if a is None:
        print(-1)
    else:
        idx = 0
        cur = head_a
        while cur is not a:
            cur = cur.next
            idx += 1
        print(idx)


if __name__ == "__main__":
    solve()
