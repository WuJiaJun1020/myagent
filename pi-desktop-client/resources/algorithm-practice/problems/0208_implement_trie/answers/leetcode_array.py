class Trie:
    def __init__(self):
        self.children = [None] * 26
        self.is_end = False

    def insert(self, word: str) -> None:
        node = self
        for ch in word:
            i = ord(ch) - ord("a")
            if node.children[i] is None:
                node.children[i] = Trie()
            node = node.children[i]
        node.is_end = True

    def search(self, word: str) -> bool:
        node = self
        for ch in word:
            i = ord(ch) - ord("a")
            if node.children[i] is None:
                return False
            node = node.children[i]
        return node.is_end

    def startsWith(self, prefix: str) -> bool:
        node = self
        for ch in prefix:
            i = ord(ch) - ord("a")
            if node.children[i] is None:
                return False
            node = node.children[i]
        return True
