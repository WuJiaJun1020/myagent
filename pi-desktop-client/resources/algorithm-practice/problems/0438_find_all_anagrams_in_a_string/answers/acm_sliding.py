import sys
from collections import Counter


def solve():
    lines = sys.stdin.read().splitlines()
    s = lines[0]
    p = lines[1]
    target = Counter(p)
    window = Counter()
    res = []
    for i, ch in enumerate(s):
        window[ch] += 1
        if i >= len(p):
            left_ch = s[i - len(p)]
            window[left_ch] -= 1
            if window[left_ch] == 0:
                del window[left_ch]
        if window == target:
            res.append(i - len(p) + 1)
    print(" ".join(map(str, res)))


if __name__ == "__main__":
    solve()
