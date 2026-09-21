import sys


def solve():
    digits = sys.stdin.read().rstrip("\n")
    if not digits:
        return
    mapping = {
        "2": "abc", "3": "def", "4": "ghi", "5": "jkl",
        "6": "mno", "7": "pqrs", "8": "tuv", "9": "wxyz",
    }
    res = []

    def backtrack(i, path):
        if i == len(digits):
            res.append("".join(path))
            return
        for ch in mapping[digits[i]]:
            path.append(ch)
            backtrack(i + 1, path)
            path.pop()

    backtrack(0, [])
    print(" ".join(res))


if __name__ == "__main__":
    solve()
