import sys
import json


class MinStack:
    def __init__(self):
        self.stack = []
        self.min_stack = []

    def push(self, val):
        self.stack.append(val)
        if not self.min_stack or val <= self.min_stack[-1]:
            self.min_stack.append(val)

    def pop(self):
        if self.stack.pop() == self.min_stack[-1]:
            self.min_stack.pop()

    def top(self):
        return self.stack[-1]

    def getMin(self):
        return self.min_stack[-1]


def solve():
    lines = sys.stdin.read().splitlines()
    ops = json.loads(lines[0])
    args = json.loads(lines[1])
    obj = None
    results = []
    for op, a in zip(ops, args):
        if op == "MinStack":
            obj = MinStack(*a)
            results.append(None)
        else:
            results.append(getattr(obj, op)(*a))
    print(json.dumps(results))


if __name__ == "__main__":
    solve()
