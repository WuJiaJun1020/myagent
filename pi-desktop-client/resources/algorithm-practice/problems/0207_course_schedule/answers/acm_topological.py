import sys
from collections import deque


def solve():
    lines = sys.stdin.read().splitlines()
    numCourses = int(lines[0])
    prerequisites = [list(map(int, line.split())) for line in lines[1:] if line.strip()]
    indegree = [0] * numCourses
    graph = [[] for _ in range(numCourses)]
    for a, b in prerequisites:
        graph[b].append(a)
        indegree[a] += 1
    q = deque([i for i in range(numCourses) if indegree[i] == 0])
    count = 0
    while q:
        course = q.popleft()
        count += 1
        for nxt in graph[course]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                q.append(nxt)
    print("true" if count == numCourses else "false")


if __name__ == "__main__":
    solve()
