#!/usr/bin/env python3
"""One-shot desktop judge bridge.

The Electron main process starts one isolated Python process per submission and
sends a single JSON job over stdin.  This module deliberately exposes no HTTP
server and never writes into the packaged problem library.

This is a stability boundary (timeout, bounded output, temporary cwd), not a
security sandbox.  User-authored Python still runs with the desktop user's OS
permissions and must be treated accordingly by the UI.
"""

from __future__ import annotations

import contextlib
import io
import json
import runpy
import sys
import time
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from core import compare, runner  # noqa: E402
from core.types import ListNode, fmt_value  # noqa: E402

MAX_CAPTURE_BYTES = 256 * 1024
MAX_FIELD_CHARS = 24_000
MAX_JOB_BYTES = 2 * 1024 * 1024


class OutputLimitExceeded(RuntimeError):
    pass


class LimitedTextBuffer(io.StringIO):
    def __init__(self, limit: int = MAX_CAPTURE_BYTES):
        super().__init__()
        self.limit = limit
        self.written = 0

    def write(self, value):
        text = str(value)
        size = len(text.encode("utf-8", errors="replace"))
        if self.written + size > self.limit:
            raise OutputLimitExceeded(f"程序输出超过 {self.limit // 1024} KiB 限制")
        self.written += size
        return super().write(text)


def _list_values_without_cycle(head):
    values = []
    seen = set()
    node = head
    while node is not None:
        if not isinstance(node, ListNode) or id(node) in seen:
            return None
        seen.add(id(node))
        values.append(node.val)
        node = node.next
    return values


_original_values_equal = compare.values_equal


def _strict_values_equal(actual, expected, eps=1e-6):
    """Reject cyclic/forged linked-list output instead of truncating it."""
    if isinstance(actual, ListNode) or isinstance(expected, ListNode):
        if not (isinstance(actual, ListNode) and isinstance(expected, ListNode)):
            return False
        actual_values = _list_values_without_cycle(actual)
        expected_values = _list_values_without_cycle(expected)
        return actual_values is not None and expected_values is not None and actual_values == expected_values
    return _original_values_equal(actual, expected, eps)


compare.values_equal = _strict_values_equal


def apply_strict_problem_checks(problem):
    """Desktop-only corrections for known permissive checks in the old site."""
    slug = problem.get("slug")
    if slug == "permutations":
        def check_permutations(actual, expected):
            try:
                return sorted(tuple(row) for row in actual) == sorted(tuple(row) for row in expected)
            except (TypeError, ValueError):
                return False

        def check_permutations_stdout(actual, expected):
            try:
                left = sorted(tuple(line.split()) for line in actual.splitlines() if line.strip())
                right = sorted(tuple(line.split()) for line in expected.splitlines() if line.strip())
                return left == right
            except (TypeError, ValueError):
                return False

        problem["check"] = check_permutations
        problem["check_stdout"] = check_permutations_stdout

    elif slug == "copy_list_with_random_pointer":
        def resolve_random_copy(actual, inputs):
            originals = set()
            node = inputs.get("head")
            while node is not None and id(node) not in originals:
                originals.add(id(node))
                node = node.next
            if actual is None:
                return []
            copied = []
            copied_ids = set()
            node = actual
            while node is not None:
                if id(node) in originals or id(node) in copied_ids:
                    return {"invalid_copy": True}
                copied_ids.add(id(node))
                copied.append(node)
                node = getattr(node, "next", None)
            index = {id(node): position for position, node in enumerate(copied)}
            result = []
            for node in copied:
                random_node = getattr(node, "random", None)
                if random_node is not None and id(random_node) not in copied_ids:
                    return {"invalid_copy": True}
                result.append([node.val, None if random_node is None else index[id(random_node)]])
            return result

        problem["resolve_answer"] = resolve_random_copy

    elif slug == "lowest_common_ancestor_of_a_binary_tree":
        def resolve_lca(actual, inputs):
            if actual is None:
                return None
            stack = [inputs.get("root")]
            valid_ids = set()
            while stack:
                node = stack.pop()
                if node is None or id(node) in valid_ids:
                    continue
                valid_ids.add(id(node))
                stack.extend((getattr(node, "left", None), getattr(node, "right", None)))
            return actual.val if id(actual) in valid_ids else {"invalid_node": True}

        problem["resolve_answer"] = resolve_lca


def harden_detail(problem, detail, mode):
    if problem.get("slug") != "longest_palindromic_substring" or not detail.get("ok"):
        return detail
    index = int(detail.get("index", 0)) - 1
    if index < 0 or index >= len(problem.get("test_cases", [])):
        detail["ok"] = False
        return detail
    source = problem["test_cases"][index]["input"]["s"]
    actual = detail.get("actual")
    if mode == "acm":
        actual = (actual or "").strip()
    detail["ok"] = (
        isinstance(actual, str)
        and actual in source
        and actual == actual[::-1]
        and len(actual) == len(problem["test_cases"][index]["output"])
    )
    return detail


def clipped(value, limit=MAX_FIELD_CHARS):
    if value is None:
        return ""
    if not isinstance(value, str):
        try:
            value = json.dumps(fmt_value(value), ensure_ascii=False, default=repr)
        except BaseException:
            value = "<无法序列化的结果>"
    if len(value) <= limit:
        return value
    return value[:limit] + "\n…（内容已截断）"


def case_error_details(problem, message, kind="runtime_error"):
    return [
        {
            "index": index,
            "ok": False,
            "input": "",
            "expected": clipped(case.get("output")),
            "actual": "",
            "error": clipped(message),
            "time_ms": 0,
            "kind": kind,
        }
        for index, case in enumerate(problem.get("test_cases", []), start=1)
    ]


def run_leetcode(problem, code_file):
    captured_stdout = LimitedTextBuffer()
    captured_stderr = LimitedTextBuffer()
    try:
        with contextlib.redirect_stdout(captured_stdout), contextlib.redirect_stderr(captured_stderr):
            passed, total, details = runner.run_leetcode_inprocess(problem, code_file)
    except OutputLimitExceeded as error:
        details = case_error_details(problem, str(error), "output_limit_exceeded")
        return 0, len(details), details
    except BaseException as error:
        message = "".join(traceback.format_exception(type(error), error, error.__traceback__))
        details = case_error_details(problem, message)
        return 0, len(details), details

    serialized = []
    for detail in details:
        error = detail.get("error") or ""
        kind = "output_limit_exceeded" if "OutputLimitExceeded" in error else "runtime_error"
        serialized.append({
            "index": int(detail.get("index", 0)),
            "ok": bool(detail.get("ok")),
            "input": clipped(detail.get("input")),
            "expected": clipped(detail.get("expected")),
            "actual": clipped(detail.get("actual")),
            "error": clipped(error),
            "time_ms": float(detail.get("time_ms") or 0),
            "kind": kind if error else None,
        })
    serialized = [harden_detail(problem, detail, "leetcode") for detail in serialized]
    return sum(1 for detail in serialized if detail["ok"]), int(total), serialized


def run_acm_case(problem, code_file, test_case, index):
    stdin = runner.build_stdin(problem, test_case["input"])
    expected = runner.build_expected_stdout(problem, test_case["output"])
    stdout = LimitedTextBuffer()
    stderr = LimitedTextBuffer()
    old_stdin = sys.stdin
    old_argv = sys.argv
    started = time.perf_counter()
    error = ""
    kind = None
    try:
        sys.stdin = io.StringIO(stdin)
        sys.argv = [str(code_file)]
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            try:
                runpy.run_path(str(code_file), run_name="__main__")
            except SystemExit as exit_error:
                if exit_error.code not in (None, 0):
                    raise RuntimeError(f"程序退出码 {exit_error.code}") from exit_error
    except OutputLimitExceeded as caught:
        error = str(caught)
        kind = "output_limit_exceeded"
    except BaseException as caught:
        error = "".join(traceback.format_exception(type(caught), caught, caught.__traceback__))
        kind = "runtime_error"
    finally:
        sys.stdin = old_stdin
        sys.argv = old_argv

    actual = stdout.getvalue()
    stderr_value = stderr.getvalue().strip()
    if not error and stderr_value:
        # stderr is useful diagnostic output but does not make a successful
        # program fail, matching common online-judge behavior.
        stderr_value = clipped(stderr_value)
    ok = not error and runner._compare_stdout(problem, actual, expected)
    detail = {
        "index": index,
        "ok": bool(ok),
        "input": clipped(stdin),
        "expected": clipped(expected),
        "actual": clipped(actual),
        "error": clipped(error),
        "stderr": stderr_value,
        "time_ms": (time.perf_counter() - started) * 1000,
        "kind": kind,
    }
    return harden_detail(problem, detail, "acm")


def run_acm(problem, code_file):
    details = [
        run_acm_case(problem, code_file, test_case, index)
        for index, test_case in enumerate(problem.get("test_cases", []), start=1)
    ]
    return sum(1 for detail in details if detail["ok"]), len(details), details


def main():
    raw = sys.stdin.buffer.read(MAX_JOB_BYTES + 1)
    if len(raw) > MAX_JOB_BYTES:
        raise ValueError(f"评测请求超过 {MAX_JOB_BYTES // 1024} KiB 限制")
    job = json.loads(raw.decode("utf-8"))
    slug = job.get("slug")
    mode = job.get("mode")
    code = job.get("code")
    if not isinstance(slug, str) or not slug.replace("_", "").isalnum():
        raise ValueError("题目 slug 无效")
    if mode not in ("leetcode", "acm"):
        raise ValueError("评测模式无效")
    if not isinstance(code, str) or len(code) > 200_000:
        raise ValueError("代码格式无效或过大")

    _problem_dir, problem = runner.find_problem(slug)
    if not problem or problem.get("slug") != slug:
        raise ValueError(f"未找到题目: {slug}")
    apply_strict_problem_checks(problem)

    code_file = Path.cwd() / ("solution.py" if mode == "leetcode" else "main.py")
    code_file.write_text(code, encoding="utf-8", newline="\n")
    started = time.perf_counter()
    if mode == "leetcode":
        passed, total, details = run_leetcode(problem, code_file)
    else:
        passed, total, details = run_acm(problem, code_file)
    elapsed = (time.perf_counter() - started) * 1000
    sys.stdout.write(json.dumps({
        "passed": passed,
        "total": total,
        "duration_ms": elapsed,
        "details": details,
    }, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except BaseException as error:
        fatal = "".join(traceback.format_exception(type(error), error, error.__traceback__))
        sys.stdout.write(json.dumps({"fatal": clipped(fatal)}, ensure_ascii=False))
        sys.exit(1)
