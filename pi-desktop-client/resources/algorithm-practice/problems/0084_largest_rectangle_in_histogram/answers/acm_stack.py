import sys


def solve():
    heights = list(map(int, sys.stdin.read().split()))
    stack = []
    ans = 0
    heights = heights + [0]
    for i, h in enumerate(heights):
        while stack and h < heights[stack[-1]]:
            top = stack.pop()
            width = i if not stack else i - stack[-1] - 1
            ans = max(ans, heights[top] * width)
        stack.append(i)
    print(ans)


if __name__ == "__main__":
    solve()
