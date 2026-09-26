import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_INTERVIEW_CHAT_PROMPTS, INTERVIEW_TOPIC_SCOPE_RULES } from "../../../shared/interview-chat-prompt";
import { clearInterviewChatPrompts, IMMEDIATE_PREVIOUS_DEFAULT_INTERVIEW_CHAT_PROMPTS,
  PREVIOUS_DEFAULT_INTERVIEW_CHAT_PROMPTS, PRE_TOPIC_FLOW_DEFAULT_INTERVIEW_CHAT_PROMPTS, PRE_JSON_DEFAULT_INTERVIEW_CHAT_PROMPTS,
  readInterviewChatPrompts, saveInterviewChatPrompts } from "./interview-prompt-preferences";

afterEach(() => vi.unstubAllGlobals());

describe("interview prompt preferences", () => {
  it("remembers the three editable prompt sections per interview", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } });
    const prompts = { systemPrompt: "系统规则一\n系统规则二", startInstruction: "开场规则", replyInstruction: "续谈规则" };
    expect(readInterviewChatPrompts("prompt-first")).toEqual(DEFAULT_INTERVIEW_CHAT_PROMPTS);
    saveInterviewChatPrompts("prompt-first", prompts);
    expect(readInterviewChatPrompts("prompt-first")).toEqual(prompts);
    expect(JSON.parse(values.get("interview:chat-prompts:v1:prompt-first") ?? "null")).toEqual(prompts);
    expect(readInterviewChatPrompts("prompt-second")).toEqual(DEFAULT_INTERVIEW_CHAT_PROMPTS);
    clearInterviewChatPrompts("prompt-first");
    expect(readInterviewChatPrompts("prompt-first")).toEqual(DEFAULT_INTERVIEW_CHAT_PROMPTS);
  });

  it("falls back to the built-in text when local storage contains an invalid prompt", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => '{"systemPrompt":"","startInstruction":"x"}' } });
    expect(readInterviewChatPrompts("invalid-prompt")).toEqual(DEFAULT_INTERVIEW_CHAT_PROMPTS);
  });

  it("upgrades an unchanged previous default without overwriting an edited prompt", () => {
    expect(IMMEDIATE_PREVIOUS_DEFAULT_INTERVIEW_CHAT_PROMPTS.systemPrompt).not.toContain(INTERVIEW_TOPIC_SCOPE_RULES[0]);
    const values = new Map<string, string>([
      ["interview:chat-prompts:v1:pre-json-default", JSON.stringify(PRE_JSON_DEFAULT_INTERVIEW_CHAT_PROMPTS)],
      ["interview:chat-prompts:v1:edited-pre-json", JSON.stringify({ ...PRE_JSON_DEFAULT_INTERVIEW_CHAT_PROMPTS,
        systemPrompt: `${PRE_JSON_DEFAULT_INTERVIEW_CHAT_PROMPTS.systemPrompt}\n我编辑的面试规则。` })],
      ["interview:chat-prompts:v1:old-default", JSON.stringify(PREVIOUS_DEFAULT_INTERVIEW_CHAT_PROMPTS)],
      ["interview:chat-prompts:v1:last-default", JSON.stringify(IMMEDIATE_PREVIOUS_DEFAULT_INTERVIEW_CHAT_PROMPTS)],
      ["interview:chat-prompts:v1:pre-topic-default", JSON.stringify(PRE_TOPIC_FLOW_DEFAULT_INTERVIEW_CHAT_PROMPTS)],
      ["interview:chat-prompts:v1:edited-last", JSON.stringify({ ...IMMEDIATE_PREVIOUS_DEFAULT_INTERVIEW_CHAT_PROMPTS,
        systemPrompt: `${IMMEDIATE_PREVIOUS_DEFAULT_INTERVIEW_CHAT_PROMPTS.systemPrompt}\n我自己添加的规则。` })],
      ["interview:chat-prompts:v1:edited-old", JSON.stringify({ ...PREVIOUS_DEFAULT_INTERVIEW_CHAT_PROMPTS,
        systemPrompt: `${PREVIOUS_DEFAULT_INTERVIEW_CHAT_PROMPTS.systemPrompt}\n我添加的规则。` })],
    ]);
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    } });
    expect(readInterviewChatPrompts("old-default")).toEqual(DEFAULT_INTERVIEW_CHAT_PROMPTS);
    expect(readInterviewChatPrompts("pre-json-default")).toEqual(DEFAULT_INTERVIEW_CHAT_PROMPTS);
    expect(readInterviewChatPrompts("edited-pre-json").systemPrompt).toContain("我编辑的面试规则。");
    expect(readInterviewChatPrompts("last-default")).toEqual(DEFAULT_INTERVIEW_CHAT_PROMPTS);
    expect(readInterviewChatPrompts("pre-topic-default")).toEqual(DEFAULT_INTERVIEW_CHAT_PROMPTS);
    expect(readInterviewChatPrompts("edited-last").systemPrompt).toContain("我自己添加的规则。");
    for (const rule of INTERVIEW_TOPIC_SCOPE_RULES) expect(readInterviewChatPrompts("last-default").systemPrompt).toContain(rule);
    expect(JSON.parse(values.get("interview:chat-prompts:v1:old-default") ?? "null"))
      .toEqual(DEFAULT_INTERVIEW_CHAT_PROMPTS);
    expect(readInterviewChatPrompts("edited-old").systemPrompt).toContain("我添加的规则。");
  });
});
