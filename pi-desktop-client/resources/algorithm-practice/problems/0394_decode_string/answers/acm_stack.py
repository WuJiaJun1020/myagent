import sys


def solve():
    s = sys.stdin.read().rstrip("\n")
    stack = []
    cur_num = 0
    cur_str = ""
    for ch in s:
        if ch.isdigit():
            cur_num = cur_num * 10 + int(ch)
        elif ch == "[":
            stack.append((cur_str, cur_num))
            cur_str = ""
            cur_num = 0
        elif ch == "]":
            prev_str, num = stack.pop()
            cur_str = prev_str + num * cur_str
        else:
            cur_str += ch
    print(cur_str)


if __name__ == "__main__":
    solve()
