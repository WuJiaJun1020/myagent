from collections import deque


class Solution:
    def numSquares(self, n: int) -> int:
        squares = [i * i for i in range(1, int(n ** 0.5) + 1)]
        q = deque([(n, 0)])
        seen = set()
        while q:
            remain, level = q.popleft()
            if remain == 0:
                return level
            for sq in squares:
                nxt = remain - sq
                if nxt >= 0 and nxt not in seen:
                    seen.add(nxt)
                    q.append((nxt, level + 1))
        return -1
