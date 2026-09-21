import sys
import json


class Trie:
    def __init__(self):
        self.children = {}
        self.is_end = False

    def insert(self, word):
        node = self
        for ch in word:
            if ch not in node.children:
                node.children[ch] = Trie()
            node = node.children[ch]
        node.is_end = True

    def search(self, word):
        node = self
        for ch in word:
            if ch not in node.children:
                return False
            node = node.children[ch]
        return node.is_end

    def startsWith(self, prefix):
        node = self
        for ch in prefix:
            if ch not in node.children:
                return False
            node = node.children[ch]
        return True


def solve():
    lines = sys.stdin.read().splitlines()
    ops = json.loads(lines[0])
    args = json.loads(lines[1])
    obj = None
    results = []
    for op, a in zip(ops, args):
        if op == "Trie":
            obj = Trie(*a)
            results.append(None)
        else:
            results.append(getattr(obj, op)(*a))
    print(json.dumps(results))


if __name__ == "__main__":
    solve()
