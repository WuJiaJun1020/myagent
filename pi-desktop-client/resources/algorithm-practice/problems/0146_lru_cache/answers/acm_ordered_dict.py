import sys
import json
from collections import OrderedDict


class LRUCache:
    def __init__(self, capacity):
        self.cap = capacity
        self.cache = OrderedDict()

    def get(self, key):
        if key not in self.cache:
            return -1
        self.cache.move_to_end(key)
        return self.cache[key]

    def put(self, key, value):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.cap:
            self.cache.popitem(last=False)


def solve():
    lines = sys.stdin.read().splitlines()
    ops = json.loads(lines[0])
    args = json.loads(lines[1])
    obj = None
    results = []
    for op, a in zip(ops, args):
        if op == "LRUCache":
            obj = LRUCache(*a)
            results.append(None)
        else:
            results.append(getattr(obj, op)(*a))
    print(json.dumps(results))


if __name__ == "__main__":
    solve()
