class Solution:
    def decodeString(self, s: str) -> str:
        def helper(i):
            res = ""
            num = 0
            while i < len(s):
                ch = s[i]
                if ch.isdigit():
                    num = num * 10 + int(ch)
                elif ch == "[":
                    sub, i = helper(i + 1)
                    res += num * sub
                    num = 0
                elif ch == "]":
                    return res, i
                else:
                    res += ch
                i += 1
            return res, i

        return helper(0)[0]
