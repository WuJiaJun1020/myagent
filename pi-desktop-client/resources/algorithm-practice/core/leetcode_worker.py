#!/usr/bin/env python3
"""力扣模式子进程评测 worker。

父进程 core/runner.run_leetcode 把题目文件路径、待测代码路径作为命令行参数传入，
本进程在独立命名空间里加载并运行用户代码，把结构化结果 JSON 输出到 stdout。

- 死循环：只会卡死本进程，由父进程的超时机制终止。
- 崩溃 / 语法错误 / sys.exit()：捕获后同样输出 JSON，不向父进程抛异常。

用法（由 runner 调用，不要手动执行）：
    python core/leetcode_worker.py '<job JSON>'
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core import runner
from core.types import fmt_value


def _serialize(details):
    """把 in-process 明细里的原始值转成可 JSON 序列化的结构（ListNode/TreeNode → 列表）。"""
    out = []
    for d in details:
        out.append({
            "index": d["index"],
            "ok": bool(d["ok"]),
            "error": d.get("error"),
            "time_ms": d.get("time_ms"),
            "input": d.get("input") or "",
            "expected": fmt_value(d.get("expected")),
            "actual": fmt_value(d.get("actual")),
        })
    return out


def main():
    job = json.loads(sys.argv[1])
    problem_path = job["problem"]
    code_file = job["code"]
    case = job.get("case")

    problem = runner._load_module("prob_worker", problem_path).PROBLEM
    passed, total, details = runner.run_leetcode_inprocess(problem, code_file, case=case)
    result = {"passed": passed, "total": total, "details": _serialize(details)}
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except BaseException as e:  # 用户代码可能 sys.exit() / 抛任意异常
        import traceback
        fatal = "".join(traceback.format_exception(type(e), e, e.__traceback__))
        sys.stdout.write(json.dumps({"fatal": fatal}, ensure_ascii=False))
        sys.exit(1)
