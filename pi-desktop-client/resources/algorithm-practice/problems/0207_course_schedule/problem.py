PROBLEM = {
    "id": 207,
    "title": "课程表",
    "slug": "course_schedule",
    "difficulty": "medium",
    "tags": ["深度优先搜索", "广度优先搜索", "图", "拓扑排序"],
    "description": (
        "你这个学期必须选修 numCourses 门课程，记为 0 到 numCourses - 1 。\n\n"
        "在选修某些课程之前需要一些先修课程。先修课程按数组 prerequisites 给出，其中 prerequisites[i] = [ai, bi] ，"
        "表示如果要学习课程 ai 则必须先学习课程 bi 。\n\n"
        "例如，先修课程对 [0, 1] 表示：想要学习课程 0 ，你需要先完成课程 1 。\n\n"
        "请你判断是否可能完成所有课程的学习？如果可以，返回 true ；否则，返回 false 。"
    ),
    "examples": [
        {"input": {"numCourses": 2, "prerequisites": [[1, 0]]}, "output": True},
        {"input": {"numCourses": 2, "prerequisites": [[1, 0], [0, 1]]}, "output": False},
    ],
    "constraints": [
        "1 <= numCourses <= 2000",
        "0 <= prerequisites.length <= 5000",
        "prerequisites[i].length == 2",
        "0 <= ai, bi < numCourses",
        "prerequisites[i] 中的所有课程对互不相同",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "canFinish",
        "params": [("numCourses", "int"), ("prerequisites", "List[List[int]]")],
        "return": "bool",
    },
    "acm": {
        "input_fields": [("numCourses", "int"), ("prerequisites", "List[List[int]]")],
        "output_type": "bool",
        "description": "第一行：numCourses；后续每行：一个先修对 [ai, bi]（空格分隔，可为空）。输出 true 或 false（小写）。",
    },
    "test_cases": [
        {"input": {"numCourses": 2, "prerequisites": [[1, 0]]}, "output": True},
        {"input": {"numCourses": 2, "prerequisites": [[1, 0], [0, 1]]}, "output": False},
        {"input": {"numCourses": 3, "prerequisites": [[1, 0], [2, 0]]}, "output": True},
    ],
}
