import sys


def solve():
    temperatures = list(map(int, sys.stdin.read().split()))
    n = len(temperatures)
    res = [0] * n
    stack = []
    for i, t in enumerate(temperatures):
        while stack and t > temperatures[stack[-1]]:
            j = stack.pop()
            res[j] = i - j
        stack.append(i)
    print(" ".join(map(str, res)))


if __name__ == "__main__":
    solve()
