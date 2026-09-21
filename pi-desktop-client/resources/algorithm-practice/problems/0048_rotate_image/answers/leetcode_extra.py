from typing import List


class Solution:
    def rotate(self, matrix: List[List[int]]) -> None:
        n = len(matrix)
        new = [[matrix[n - j - 1][i] for j in range(n)] for i in range(n)]
        for i in range(n):
            matrix[i][:] = new[i]
