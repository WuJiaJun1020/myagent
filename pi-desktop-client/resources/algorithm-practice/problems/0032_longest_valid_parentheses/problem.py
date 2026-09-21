PROBLEM = {
    "id": 32,
    "title": "最长有效括号",
    "slug": "longest_valid_parentheses",
    "difficulty": "hard",
    "tags": ["栈", "字符串", "动态规划"],
    "description": "给你一个只包含 '(' 和 ')' 的字符串，找出最长有效（格式正确且连续）括号子串的长度。",
    "examples": [
        {"input": {"s": "(()"}, "output": 2},
        {"input": {"s": ")()())"}, "output": 4},
        {"input": {"s": ""}, "output": 0},
    ],
    "constraints": [
        "0 <= s.length <= 3 * 10^4",
        "s[i] 为 '(' 或 ')'",
    ],
    "leetcode": {
        "class": "Solution",
        "method": "longestValidParentheses",
        "params": [("s", "str")],
        "return": "int",
    },
    "acm": {
        "input_fields": [("s", "str")],
        "output_type": "int",
        "description": "输入一行括号字符串 s。输出最长有效括号长度。",
    },
    "test_cases": [
        {"input": {"s": "(()"}, "output": 2},
        {"input": {"s": ")()())"}, "output": 4},
        {"input": {"s": ""}, "output": 0},
        {"input": {"s": "()"}, "output": 2},
        {"input": {"s": "()(())"}, "output": 6},
    ],
}
