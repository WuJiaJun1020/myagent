import sys
from collections import Counter


def solve():
    lines = sys.stdin.read().splitlines()
    s = lines[0]
    t = lines[1]
    need = Counter(t)
    missing = len(t)
    left = 0
    start, min_len = 0, float("inf")
    for right, ch in enumerate(s):
        if ch in need:
            if need[ch] > 0:
                missing -= 1
            need[ch] -= 1
        while missing == 0:
            if right - left + 1 < min_len:
                min_len = right - left + 1
                start = left
            if s[left] in need:
                need[s[left]] += 1
                if need[s[left]] > 0:
                    missing += 1
            left += 1
    print(s[start:start + min_len] if min_len != float("inf") else "")


if __name__ == "__main__":
    solve()
