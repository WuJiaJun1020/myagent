from core.types import build_random_list, random_list_to_data


def _build_input(inp):
    return {"head": build_random_list(inp["head"])}


def _resolve(actual, inp_copy):
    return random_list_to_data(actual)


PROBLEM = {
    "id": 138,
    "title": "随机链表的复制",
    "slug": "copy_list_with_random_pointer",
    "difficulty": "medium",
    "tags": ["哈希表", "链表"],
    "description": (
        "给你一个长度为 n 的链表，每个节点包含一个额外增加的随机指针 random ，该指针可以指向链表中的任何节点或空节点。\n\n"
        "构造这个链表的深拷贝。深拷贝应该正好由 n 个全新节点组成，其中每个新节点的值都设为其对应的原节点的值。"
        "新节点的 next 指针和 random 指针也都应指向复制链表中的新节点，并使原链表和复制链表中的这些指针能够表示相同的链表状态。"
        "复制链表中的指针都不应指向原链表中的节点。"
    ),
    "examples": [
        {"input": {"head": [[7, None], [13, 0], [11, 4], [10, 2], [1, 0]]},
         "output": [[7, None], [13, 0], [11, 4], [10, 2], [1, 0]]},
        {"input": {"head": [[1, 1], [2, 1]]}, "output": [[1, 1], [2, 1]]},
        {"input": {"head": []}, "output": []},
    ],
    "constraints": [
        "0 <= n <= 1000",
        "-10^4 <= Node.val <= 10^4",
        "Node.random 为 null 或指向链表中的节点",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "copyRandomList",
        "params": [("head", "RandomListNode")],
        "return": "RandomListNode",
    },
    "build_input": _build_input,
    "resolve_answer": _resolve,
    "acm": {
        "input_fields": [("head", "JSON")],
        "output_type": "JSON",
        "description": "输入一行 JSON（[[val, random_index], ...]，random_index 为 null 表示空）。输出复制后的 JSON。",
    },
    "test_cases": [
        {"input": {"head": [[7, None], [13, 0], [11, 4], [10, 2], [1, 0]]},
         "output": [[7, None], [13, 0], [11, 4], [10, 2], [1, 0]]},
        {"input": {"head": [[1, 1], [2, 1]]}, "output": [[1, 1], [2, 1]]},
        {"input": {"head": []}, "output": []},
    ],
}
