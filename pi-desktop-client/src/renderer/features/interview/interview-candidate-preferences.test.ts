import { afterEach, describe, expect, it, vi } from "vitest";
import { CANDIDATE_CORRECTION_ETIQUETTE_RULES, CANDIDATE_ERROR_SIMULATION_RULES, CANDIDATE_TOPIC_SCOPE_RULES,
  DEFAULT_INTERVIEW_CANDIDATE_PROMPT } from "../../../shared/interview-candidate-prompt";
import { clearInterviewCandidatePreferences, IMMEDIATE_PREVIOUS_DEFAULT_CANDIDATE_PROMPT,
  PREVIOUS_DEFAULT_CANDIDATE_PROMPT,
  readInterviewCandidatePreferences, saveInterviewCandidatePreferences } from "./interview-candidate-preferences";

afterEach(() => vi.unstubAllGlobals());

describe("interview candidate preferences", () => {
  it("upgrades only the untouched previous default prompt", () => {
    expect(IMMEDIATE_PREVIOUS_DEFAULT_CANDIDATE_PROMPT).not.toContain(CANDIDATE_TOPIC_SCOPE_RULES[0]);
    const beforeEtiquette = DEFAULT_INTERVIEW_CANDIDATE_PROMPT.replace(
      `${CANDIDATE_CORRECTION_ETIQUETTE_RULES.join("\n")}\n`, "");
    const beforeJson = DEFAULT_INTERVIEW_CANDIDATE_PROMPT.replace(CANDIDATE_ERROR_SIMULATION_RULES.join("\n"), [
      "如果本轮系统控制要求模拟一次技术误答，只在所问技术点上自然地出现一个可信的认知偏差或紧张口误；保持礼貌、连贯，其他内容照常回答。",
      "不要主动承认这是故意设置的错误，也不要提及抽签、概率、调试控制或内部提示。",
    ].join("\n")).replace("在结构化输出的 answer 字段中只写对面试官说的话，不加角色名、标题或内部分析。",
      "只输出对面试官说的话，不加角色名、标题、Markdown 代码栏或内部分析。");
    const values = new Map<string, string>([
      ["interview:candidate:v1:old", JSON.stringify({ enabled: true, settings: { reasoning: "low" },
        prompt: PREVIOUS_DEFAULT_CANDIDATE_PROMPT })],
      ["interview:candidate:v1:last-default", JSON.stringify({ enabled: true, settings: { reasoning: "low" },
        prompt: IMMEDIATE_PREVIOUS_DEFAULT_CANDIDATE_PROMPT })],
      ["interview:candidate:v1:edited-last", JSON.stringify({ enabled: true, settings: { reasoning: "low" },
        prompt: `${IMMEDIATE_PREVIOUS_DEFAULT_CANDIDATE_PROMPT}\n我自己添加的规则。` })],
      ["interview:candidate:v1:edited", JSON.stringify({ enabled: false, settings: { reasoning: "high" },
        prompt: `${PREVIOUS_DEFAULT_CANDIDATE_PROMPT}\n自定义规则` })],
      ["interview:candidate:v1:before-etiquette", JSON.stringify({ enabled: true, settings: { reasoning: "medium" },
        prompt: beforeEtiquette, errorRate: 20 })],
      ["interview:candidate:v1:before-json", JSON.stringify({ enabled: true, settings: { reasoning: "medium" },
        prompt: beforeJson, errorRate: 20 })],
      ["interview:candidate:v1:edited-before-etiquette", JSON.stringify({ enabled: true,
        settings: { reasoning: "medium" }, prompt: `${beforeEtiquette}\n用户自定义要求。`, errorRate: 20 })],
    ]);
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } });
    expect(readInterviewCandidatePreferences("old").prompt).toBe(DEFAULT_INTERVIEW_CANDIDATE_PROMPT);
    expect(readInterviewCandidatePreferences("last-default").prompt).toBe(DEFAULT_INTERVIEW_CANDIDATE_PROMPT);
    expect(readInterviewCandidatePreferences("before-etiquette").prompt).toBe(DEFAULT_INTERVIEW_CANDIDATE_PROMPT);
    expect(readInterviewCandidatePreferences("before-json").prompt).toBe(DEFAULT_INTERVIEW_CANDIDATE_PROMPT);
    expect(readInterviewCandidatePreferences("edited-before-etiquette").prompt).toContain("用户自定义要求。");
    for (const rule of CANDIDATE_CORRECTION_ETIQUETTE_RULES) {
      expect(readInterviewCandidatePreferences("before-etiquette").prompt).toContain(rule);
    }
    expect(readInterviewCandidatePreferences("edited-last").prompt).toContain("我自己添加的规则。");
    for (const rule of CANDIDATE_TOPIC_SCOPE_RULES) expect(readInterviewCandidatePreferences("last-default").prompt).toContain(rule);
    expect(JSON.parse(values.get("interview:candidate:v1:old") ?? "null").prompt).toBe(DEFAULT_INTERVIEW_CANDIDATE_PROMPT);
    expect(readInterviewCandidatePreferences("edited")).toMatchObject({ enabled: false, settings: { reasoning: "high" },
      prompt: `${PREVIOUS_DEFAULT_CANDIDATE_PROMPT}\n自定义规则` });
  });

  it("saves a per-interview prompt and cleans it up on deletion", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } });
    saveInterviewCandidatePreferences("new", { enabled: true, settings: { reasoning: "low" },
      prompt: "自定义候选人规则", errorRate: 35 });
    expect(readInterviewCandidatePreferences("new").prompt).toBe("自定义候选人规则");
    expect(readInterviewCandidatePreferences("new").errorRate).toBe(35);
    clearInterviewCandidatePreferences("new");
    expect(readInterviewCandidatePreferences("new").prompt).toBe(DEFAULT_INTERVIEW_CANDIDATE_PROMPT);
  });
});
