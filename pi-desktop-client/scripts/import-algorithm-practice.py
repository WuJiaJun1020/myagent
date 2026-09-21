#!/usr/bin/env python3
"""Import the user-owned algorithm practice archive into desktop resources.

The importer deliberately keeps only the trusted problem definitions, judge
helpers, reference answers and images. Browser assets, virtual environments,
bytecode caches, mutable solution files and progress.json are not copied.
"""

from __future__ import annotations

import importlib.util
import json
import shutil
import sys
from pathlib import Path


def load_module(path: Path):
    spec = importlib.util.spec_from_file_location("algorithm_reference_server", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载参考服务: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def safe_generated_destination(path: Path) -> Path:
    resolved = path.resolve()
    if resolved.name != "algorithm-practice" or resolved.parent.name != "resources":
        raise RuntimeError(f"拒绝写入非预期目录: {resolved}")
    return resolved


def copy_runtime(source: Path, destination: Path) -> None:
    core_destination = destination / "core"
    core_destination.mkdir(parents=True, exist_ok=True)
    for name in ("__init__.py", "compare.py", "types.py", "runner.py", "leetcode_worker.py"):
        shutil.copy2(source / "core" / name, core_destination / name)

    problems_destination = destination / "problems"
    problems_destination.mkdir(parents=True, exist_ok=True)
    for problem_dir in sorted((source / "problems").iterdir()):
        if not problem_dir.is_dir() or not (problem_dir / "problem.py").is_file():
            continue
        target = problems_destination / problem_dir.name
        target.mkdir(parents=True, exist_ok=True)
        shutil.copy2(problem_dir / "problem.py", target / "problem.py")

        answers = problem_dir / "answers"
        if answers.is_dir():
            answer_target = target / "answers"
            answer_target.mkdir(parents=True, exist_ok=True)
            for answer in answers.glob("*.py"):
                shutil.copy2(answer, answer_target / answer.name)

        images = problem_dir / "images"
        if images.is_dir():
            image_target = target / "images"
            image_target.mkdir(parents=True, exist_ok=True)
            for image in images.iterdir():
                if image.is_file() and image.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
                    shutil.copy2(image, image_target / image.name)


def build_catalog(source: Path) -> dict:
    sys.path.insert(0, str(source))
    server = load_module(source / "server.py")
    runner = server.runner
    summaries = []
    details = {}
    category_counts: dict[str, int] = {}

    for problem_dir, problem in runner.iter_problems():
        category = runner.problem_category(problem)
        category_counts[category] = category_counts.get(category, 0) + 1
        summaries.append({
            "id": problem["id"],
            "slug": problem["slug"],
            "title": problem["title"],
            "difficulty": problem["difficulty"],
            "category": category,
            "tags": list(problem.get("tags", [])),
        })

        imported = server._problem_detail(problem_dir, problem)
        examples = []
        for example in imported["examples"]:
            image = example.get("image", "")
            image_file = image.rsplit("/", 1)[-1] if image else None
            examples.append({
                "leetcodeInput": example["leetcode_input"],
                "output": example["output"],
                "acmStdin": example["acm_stdin"],
                "acmStdout": example["acm_stdout"],
                "explanation": example.get("explanation", ""),
                "imageFile": image_file,
            })

        leetcode = problem["leetcode"]
        details[problem["slug"]] = {
            **summaries[-1],
            "description": problem.get("description", ""),
            "constraints": list(problem.get("constraints", [])),
            "followUp": problem.get("follow_up", ""),
            "leetcode": {
                "className": leetcode["class"],
                "methodName": leetcode.get("method"),
                "parameters": [
                    {"name": name, "type": type_name}
                    for name, type_name in leetcode.get("params", [])
                ],
                "returnType": leetcode.get("return"),
            },
            "acm": {
                "inputFields": [
                    {"name": name, "type": type_name}
                    for name, type_name in problem["acm"].get("input_fields", [])
                ],
                "outputType": problem["acm"].get("output_type", ""),
                "description": problem["acm"].get("description", ""),
            },
            "examples": examples,
            "templates": {
                "leetcode": imported["template_leetcode"],
                "acm": imported["template_acm"],
            },
            "answers": [
                {
                    "mode": answer["mode"],
                    "name": answer["name"],
                    "file": answer["file"],
                    "code": answer["code"],
                }
                for answer in imported["answers"]
            ],
        }

    ordered_categories = [
        {"name": name, "count": category_counts[name]}
        for name in runner.CATEGORY_ORDER
        if category_counts.get(name)
    ]
    remaining = sorted(set(category_counts) - {item["name"] for item in ordered_categories})
    ordered_categories.extend({"name": name, "count": category_counts[name]} for name in remaining)
    return {
        "version": 1,
        "collection": {
            "id": "leetcode-hot-100",
            "title": "LeetCode Hot 100",
            "description": "本地双模式算法练习题库",
        },
        "categories": ordered_categories,
        "problems": summaries,
        "details": details,
    }


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("用法: import-algorithm-practice.py <参考项目目录> <resources/algorithm-practice>")
    source = Path(sys.argv[1]).resolve()
    destination = safe_generated_destination(Path(sys.argv[2]))
    if not (source / "server.py").is_file() or not (source / "problems").is_dir():
        raise RuntimeError(f"参考项目结构不完整: {source}")

    destination.mkdir(parents=True, exist_ok=True)
    for generated in (destination / "core", destination / "problems"):
        if generated.exists():
            shutil.rmtree(generated)
    catalog_path = destination / "catalog.json"
    if catalog_path.exists():
        catalog_path.unlink()

    copy_runtime(source, destination)
    catalog_path.write_text(
        json.dumps(build_catalog(source), ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"已导入 {len(json.loads(catalog_path.read_text(encoding='utf-8'))['problems'])} 道题到 {destination}")


if __name__ == "__main__":
    main()
