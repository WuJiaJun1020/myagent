import sys


def solve():
    s = sys.stdin.read().rstrip("\n")
    stack = [-1]
    ans = 0
    for i, ch in enumerate(s):
        if ch == "(":
            stack.append(i)
        else:
            stack.pop()
            if not stack:
                stack.append(i)
            else:
                ans = max(ans, i - stack[-1])
    print(ans)


if __name__ == "__main__":
    solve()
