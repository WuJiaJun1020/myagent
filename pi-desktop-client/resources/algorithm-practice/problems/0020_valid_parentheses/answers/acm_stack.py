import sys


def solve():
    s = sys.stdin.read().rstrip("\n")
    stack = []
    pairs = {")": "(", "]": "[", "}": "{"}
    for ch in s:
        if ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                print("false")
                return
        else:
            stack.append(ch)
    print("true" if not stack else "false")


if __name__ == "__main__":
    solve()
