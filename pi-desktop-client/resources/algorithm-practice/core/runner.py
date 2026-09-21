"""评测引擎：力扣模式（加载函数）与 ACM 模式（子进程 + stdin/stdout）。"""
import copy
import importlib.util
import json
import os
import subprocess
import sys
import time
import traceback
from pathlib import Path

from core import compare
from core.types import fmt_value, to_acm_string

ROOT = Path(__file__).resolve().parent.parent
PROBLEMS_DIR = ROOT / "problems"

# 官方 Hot 100 题单的 17 个专题（每道题归一个主专题）
CATEGORY_ORDER = [
    "哈希", "双指针", "滑动窗口", "子串", "普通数组", "矩阵", "链表",
    "二叉树", "图论", "回溯", "二分查找", "栈", "堆", "贪心算法",
    "动态规划", "多维动态规划", "技巧",
]

PROBLEM_CATEGORY = {
    # 哈希
    "two_sum": "哈希", "group_anagrams": "哈希", "longest_consecutive_sequence": "哈希",
    # 双指针
    "move_zeroes": "双指针", "container_with_most_water": "双指针",
    "three_sum": "双指针", "trapping_rain_water": "双指针",
    # 滑动窗口
    "longest_substring_without_repeating_characters": "滑动窗口",
    "find_all_anagrams_in_a_string": "滑动窗口",
    # 子串
    "subarray_sum_equals_k": "子串", "sliding_window_maximum": "子串",
    "minimum_window_substring": "子串",
    # 普通数组
    "maximum_subarray": "普通数组", "merge_intervals": "普通数组",
    "rotate_array": "普通数组", "product_of_array_except_self": "普通数组",
    "first_missing_positive": "普通数组",
    # 矩阵
    "set_matrix_zeroes": "矩阵", "spiral_matrix": "矩阵",
    "rotate_image": "矩阵", "search_a_2d_matrix_ii": "矩阵",
    # 链表
    "intersection_of_two_linked_lists": "链表", "reverse_linked_list": "链表",
    "palindrome_linked_list": "链表", "linked_list_cycle": "链表",
    "linked_list_cycle_ii": "链表", "merge_two_sorted_lists": "链表",
    "add_two_numbers": "链表", "remove_nth_node_from_end_of_list": "链表",
    "swap_nodes_in_pairs": "链表", "reverse_nodes_in_k_group": "链表",
    "copy_list_with_random_pointer": "链表", "sort_list": "链表",
    "merge_k_sorted_lists": "链表", "lru_cache": "链表",
    # 二叉树
    "binary_tree_inorder_traversal": "二叉树", "maximum_depth_of_binary_tree": "二叉树",
    "invert_binary_tree": "二叉树", "symmetric_tree": "二叉树",
    "diameter_of_binary_tree": "二叉树", "binary_tree_level_order_traversal": "二叉树",
    "convert_sorted_array_to_binary_search_tree": "二叉树",
    "validate_binary_search_tree": "二叉树", "kth_smallest_element_in_a_bst": "二叉树",
    "binary_tree_right_side_view": "二叉树", "flatten_binary_tree_to_linked_list": "二叉树",
    "construct_binary_tree_from_preorder_and_inorder_traversal": "二叉树",
    "path_sum_iii": "二叉树", "lowest_common_ancestor_of_a_binary_tree": "二叉树",
    "binary_tree_maximum_path_sum": "二叉树",
    # 图论
    "number_of_islands": "图论", "rotting_oranges": "图论",
    "course_schedule": "图论", "implement_trie": "图论",
    # 回溯
    "permutations": "回溯", "subsets": "回溯",
    "letter_combinations_of_a_phone_number": "回溯", "combination_sum": "回溯",
    "generate_parentheses": "回溯", "word_search": "回溯",
    "palindrome_partitioning": "回溯", "n_queens": "回溯",
    # 二分查找
    "search_insert_position": "二分查找", "search_a_2d_matrix": "二分查找",
    "find_first_and_last_position_of_element_in_sorted_array": "二分查找",
    "search_in_rotated_sorted_array": "二分查找",
    "find_minimum_in_rotated_sorted_array": "二分查找",
    "median_of_two_sorted_arrays": "二分查找",
    # 栈
    "valid_parentheses": "栈", "min_stack": "栈", "decode_string": "栈",
    "daily_temperatures": "栈", "largest_rectangle_in_histogram": "栈",
    # 堆
    "kth_largest_element_in_an_array": "堆", "top_k_frequent_elements": "堆",
    "find_median_from_data_stream": "堆",
    # 贪心算法
    "best_time_to_buy_and_sell_stock": "贪心算法", "jump_game": "贪心算法",
    "jump_game_ii": "贪心算法", "partition_labels": "贪心算法",
    # 动态规划
    "climbing_stairs": "动态规划", "pascals_triangle": "动态规划",
    "house_robber": "动态规划", "perfect_squares": "动态规划",
    "coin_change": "动态规划", "word_break": "动态规划",
    "longest_increasing_subsequence": "动态规划", "maximum_product_subarray": "动态规划",
    "partition_equal_subset_sum": "动态规划", "longest_valid_parentheses": "动态规划",
    "regular_expression_matching": "动态规划",
    # 多维动态规划
    "unique_paths": "多维动态规划", "minimum_path_sum": "多维动态规划",
    "longest_palindromic_substring": "多维动态规划", "edit_distance": "多维动态规划",
    # 技巧
    "single_number": "技巧", "majority_element": "技巧", "sort_colors": "技巧",
    "next_permutation": "技巧", "find_the_duplicate_number": "技巧",
}


def problem_category(problem):
    return PROBLEM_CATEGORY.get(problem["slug"], "其他")


# ---------------------------------------------------------------- 做题进度

PROGRESS_FILE = ROOT / "progress.json"


def load_progress():
    """读取做题进度 {slug: {"leetcode": bool, "acm": bool}}。"""
    if PROGRESS_FILE.exists():
        try:
            return json.loads(PROGRESS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_progress(data):
    PROGRESS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def mark_solved(slug, mode):
    """把某道题的某个模式标记为已完成。"""
    data = load_progress()
    entry = data.setdefault(slug, {})
    entry[mode] = True
    save_progress(data)


def unmark_solved(slug, mode):
    """清除某道题某个模式的完成标记。"""
    data = load_progress()
    entry = data.get(slug, {})
    entry[mode] = False
    save_progress(data)


def _fmt(v):
    """把结构化值转成可读字符串（列表/链表/树 → JSON 风格）。"""
    return json.dumps(fmt_value(v), ensure_ascii=False)


def _fmt_time(ms):
    if ms < 0.01:
        return "<0.01 ms"
    return f"{ms:.2f} ms"


# ---------------------------------------------------------------- 题目加载

def _load_module(name, path):
    # 先移除同名旧模块，保证重复加载（网页反复运行同一文件）时不会残留上次的类/变量
    sys.modules.pop(name, None)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def iter_problems():
    """按目录顺序遍历所有题目，返回 (目录, PROBLEM 字典)。"""
    if not PROBLEMS_DIR.exists():
        return
    for d in sorted(PROBLEMS_DIR.iterdir()):
        if not d.is_dir():
            continue
        pf = d / "problem.py"
        if not pf.exists():
            continue
        mod = _load_module(f"prob_{d.name}", pf)
        p = mod.PROBLEM
        p["_problem_file"] = str(pf)  # 供子进程评测按路径重新加载题目定义
        yield d, p


def find_problem(key):
    """按 slug（支持下划线/连字符）或数字 id 查找题目。"""
    key = key.strip()
    for d, p in iter_problems():
        if key in (p["slug"], p["slug"].replace("_", "-"), str(p["id"]), f"{p['id']:04d}"):
            return d, p
    return None, None


def load_answers(problem_dir):
    """读取 problem_dir/answers/_manifest.py，返回该题全部参考题解列表。

    每项为 {"mode", "name", "file", "file_path", "code"}。
    """
    manifest = problem_dir / "answers" / "_manifest.py"
    if not manifest.exists():
        return []
    mod = _load_module(f"answers_{problem_dir.name}", manifest)
    answers = []
    for entry in mod.ANSWERS:
        f = problem_dir / "answers" / entry["file"]
        answers.append({
            "mode": entry["mode"],
            "name": entry["name"],
            "file": entry["file"],
            "file_path": str(f),
            "code": f.read_text(encoding="utf-8") if f.exists() else "",
        })
    return answers


# ---------------------------------------------------------------- ACM 输入输出

def build_stdin(problem, input_dict):
    """按 acm.input_fields 的顺序，把结构化输入序列化成 stdin 文本。"""
    lines = []
    for name, type_str in problem["acm"]["input_fields"]:
        lines.append(to_acm_string(input_dict[name], type_str))
    return "\n".join(lines)


def build_expected_stdout(problem, output_value):
    """把结构化期望输出序列化成期望的 stdout 文本。"""
    s = to_acm_string(output_value, problem["acm"]["output_type"])
    return s + "\n" if s else ""


# ---------------------------------------------------------------- 力扣模式

def run_leetcode_class(problem, code_file, case=None):
    """类设计题：按「操作序列」实例化类并逐个调用方法，比较返回值。

    测试用例结构为 {input: {operations, arguments}, output: [...]}。
    """
    mod = _load_module("_user_solution", code_file)
    cls = getattr(mod, problem["leetcode"]["class"])
    cases = problem["test_cases"]
    indices = list(range(1, len(cases) + 1))
    if case is not None:
        cases = [cases[case - 1]]
        indices = [case]

    passed = 0
    details = []
    for idx, tc in zip(indices, cases):
        ops = tc["input"]["operations"]
        args_list = tc["input"]["arguments"]
        expected = tc["output"]
        input_str = "operations = {}, arguments = {}".format(
            json.dumps(ops, ensure_ascii=False), json.dumps(args_list, ensure_ascii=False)
        )
        actual = None
        err = None
        t0 = time.perf_counter()
        try:
            obj = cls(*args_list[0])
            actual = [None]  # 构造方法
            for op, a in zip(ops[1:], args_list[1:]):
                actual.append(getattr(obj, op)(*a))
        except Exception:
            err = traceback.format_exc()
        time_ms = (time.perf_counter() - t0) * 1000

        ok = err is None
        if ok:
            for i in range(1, len(expected)):
                if expected[i] is None:
                    continue
                if not compare.values_equal(actual[i], expected[i]):
                    ok = False
                    break

        details.append({
            "index": idx, "ok": ok, "actual": actual, "expected": expected,
            "error": err, "input": input_str, "time_ms": time_ms,
        })
        if ok:
            passed += 1
    return passed, len(cases), details


def run_leetcode_inprocess(problem, code_file, case=None):
    """在【当前进程】内加载 code_file 里的 Solution 类并逐用例评测。

    无超时控制，仅供验证参考题解等「可信代码」使用（见 verify_all.py）；
    用户代码请走 run_leetcode（子进程 + 超时）。

    返回 (通过数, 总数, 明细)。明细每项为 dict：
    {index, ok, actual, expected, error, input, time_ms}。
    """
    if problem["test_cases"] and "operations" in problem["test_cases"][0].get("input", {}):
        return run_leetcode_class(problem, code_file, case)

    mod = _load_module("_user_solution", code_file)
    lc = problem["leetcode"]
    cls = getattr(mod, lc["class"])
    method_name = lc["method"]
    check = problem.get("check")  # 可选的自定义比较函数（如「答案顺序任意」）
    param_names = [name for name, _ in lc["params"]]
    inplace = lc.get("inplace")              # 原地修改的入参名：比较修改后的入参
    resolve = problem.get("resolve_answer")  # 返回节点引用时：转成可比形式

    cases = problem["test_cases"]
    indices = list(range(1, len(cases) + 1))
    if case is not None:
        cases = [cases[case - 1]]
        indices = [case]

    passed = 0
    details = []
    for idx, tc in zip(indices, cases):
        inp = tc["input"]
        if "build_input" in problem:
            inp = problem["build_input"](inp)
        # 整份深拷贝（保留共享引用，如相交链表的公共尾部），避免污染后续用例
        inp_copy = copy.deepcopy(inp)
        args = [inp_copy[name] for name in param_names]
        input_str = ", ".join(f"{k} = {_fmt(v)}" for k, v in tc["input"].items())
        expected = tc["output"]

        obj = cls()
        method = getattr(obj, method_name)
        actual = None
        err = None
        t0 = time.perf_counter()
        try:
            ret = method(*args)
            if inplace:
                actual = inp_copy[inplace]
            elif resolve:
                actual = resolve(ret, inp_copy)
            else:
                actual = ret
        except Exception:
            err = traceback.format_exc()
        time_ms = (time.perf_counter() - t0) * 1000

        if err is None:
            try:
                ok = check(actual, expected) if check else compare.values_equal(actual, expected)
            except Exception:
                # 自定义比较函数无法处理实际返回（如返回了 None）时，判为不等
                ok = False
        else:
            ok = False

        details.append({
            "index": idx, "ok": ok, "actual": actual, "expected": expected,
            "error": err, "input": input_str, "time_ms": time_ms,
        })
        if ok:
            passed += 1
    return passed, len(cases), details


# ---------------------------------------------------------------- 力扣模式（子进程 + 超时）

LEETCODE_TIMEOUT = 5
_LEETCODE_WORKER = ROOT / "core" / "leetcode_worker.py"


def _case_error_details(problem, case, err):
    """构造「每个用例都失败」的明细（用于超时 / 子进程异常 / 语法错误）。"""
    total = len(problem["test_cases"])
    indices = [case] if case is not None else list(range(1, total + 1))
    details = []
    for i in indices:
        details.append({
            "index": i, "ok": False, "actual": None,
            "expected": problem["test_cases"][i - 1]["output"],
            "error": err, "input": "", "time_ms": 0,
        })
    return 0, total, details


def run_leetcode(problem, code_file, case=None, timeout=LEETCODE_TIMEOUT):
    """力扣模式（带超时）：用户代码在独立子进程里执行，避免死循环拖垮主服务。

    - 死循环：超时后子进程整个被杀掉，主线程不被阻塞。
    - 崩溃 / 语法错误：以错误明细形式返回，不向调用方抛异常。
    返回结构与 run_leetcode_inprocess 一致（actual/expected 已转为可打印结构）。
    """
    problem_file = problem.get("_problem_file")
    if not problem_file:  # 非 iter_problems/find_problem 来源的题目，退回进程内评测
        return run_leetcode_inprocess(problem, code_file, case)

    job = json.dumps({"problem": problem_file, "code": str(code_file), "case": case})
    env = dict(os.environ, PYTHONPATH=str(ROOT))
    try:
        proc = subprocess.run(
            [sys.executable, str(_LEETCODE_WORKER), job],
            capture_output=True, text=True, encoding="utf-8",
            timeout=timeout, cwd=str(ROOT), env=env,
        )
    except subprocess.TimeoutExpired:
        return _case_error_details(problem, case, f"超时（>{timeout}s，疑似死循环）")
    # 先尝试解析 stdout 的 JSON：worker 会把 fatal（语法错误/崩溃/exit）写在这里
    try:
        data = json.loads(proc.stdout or "{}")
    except ValueError:
        data = None
    if data and "fatal" in data:
        return _case_error_details(problem, case, data["fatal"].strip())
    if data and "passed" in data and "total" in data:
        return data["passed"], data["total"], data["details"]
    # 走到这里：worker 异常退出且没有可解析输出
    err = proc.stderr.strip() or f"子进程退出码 {proc.returncode}"
    return _case_error_details(problem, case, err)


# ---------------------------------------------------------------- ACM 模式

def run_acm(problem, code_file, case=None, timeout=10):
    """把 code_file 当完整程序跑：喂 stdin、抓 stdout、与期望输出比较。

    返回 (通过数, 总数, 明细)。明细每项为 dict：
    {index, ok, actual, expected, error, stdin, time_ms}。
    """
    cases = problem["test_cases"]
    indices = list(range(1, len(cases) + 1))
    if case is not None:
        cases = [cases[case - 1]]
        indices = [case]

    env = dict(os.environ, PYTHONPATH=str(ROOT))
    passed = 0
    details = []
    for idx, tc in zip(indices, cases):
        stdin = build_stdin(problem, tc["input"])
        expected_stdout = build_expected_stdout(problem, tc["output"])
        err = None
        actual = None
        t0 = time.perf_counter()
        try:
            proc = subprocess.run(
                [sys.executable, str(code_file)],
                input=stdin,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=str(ROOT),
                env=env,
            )
            if proc.returncode != 0:
                err = proc.stderr.strip() or f"程序退出码 {proc.returncode}"
            else:
                actual = proc.stdout
        except subprocess.TimeoutExpired:
            err = f"超时（>{timeout}s）"
        time_ms = (time.perf_counter() - t0) * 1000

        if err is None:
            ok = _compare_stdout(problem, actual, expected_stdout)
        else:
            ok = False

        details.append({
            "index": idx, "ok": ok, "actual": actual, "expected": expected_stdout,
            "error": err, "stdin": stdin, "time_ms": time_ms,
        })
        if ok:
            passed += 1
    return passed, len(cases), details


def _compare_stdout(problem, actual, expected):
    if "check_stdout" in problem:
        return problem["check_stdout"](actual, expected)
    return compare.normalize_stdout(actual) == compare.normalize_stdout(expected)


# ---------------------------------------------------------------- 结果展示

def format_case_report(problem, mode, details):
    """把一次评测的明细格式化成可读文本（通过/失败都显示耗时，失败显示详情）。"""
    out = []
    for d in details:
        out.append(f"用例 {d['index']}  {'✅' if d['ok'] else '❌'}  ({_fmt_time(d['time_ms'])})")
        if d["ok"]:
            continue
        if d["error"]:
            for e in d["error"].strip().splitlines():
                out.append(f"     异常: {e}")
        elif mode == "acm":
            out.append(f"     输入(stdin): {d['stdin']!r}")
            out.append(f"     期望输出:     {d['expected']!r}")
            out.append(f"     实际输出:     {d['actual']!r}")
        else:
            out.append(f"     输入: {d['input']}")
            out.append(f"     期望: {_fmt(d['expected'])}")
            out.append(f"     实际: {_fmt(d['actual'])}")
    return "\n".join(out)


def print_summary(title, passed, total):
    bar = "=" * 40
    print(bar)
    print(f"{title}: 通过 {passed}/{total}")
    print(bar)
    return passed == total
