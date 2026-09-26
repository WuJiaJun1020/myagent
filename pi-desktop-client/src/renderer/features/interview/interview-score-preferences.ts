import { useSyncExternalStore } from "react";
import { DEFAULT_SCORE_CHAT_SETTINGS, type InterviewChatSettings } from "../../../shared/contracts/interview";
import { DEFAULT_INTERVIEW_SCORE_PROMPT } from "../../../shared/interview-score";

const KEY_PREFIX = "interview:score-prompt:v1:";
const SETTINGS_KEY_PREFIX = "interview:score-settings:v1:";
const PRE_CORRECTION_DEFAULT_SCORE_PROMPT = DEFAULT_INTERVIEW_SCORE_PROMPT.replace(
  "如果面试官纠正错误后，候选人只复述面试官给出的正确答案，不把这段复述当成独立掌握的证据；仍以纠错前回答及后续能否迁移应用为准。\n", "");
const cache = new Map<string, string>();
const settingsCache = new Map<string, InterviewChatSettings>();
const LEVELS = new Set(["default", "minimal", "low", "medium", "high", "xhigh", "max"]);
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const notify = () => { for (const listener of listeners) listener(); };

export function readInterviewScorePrompt(id: string): string {
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  let prompt = DEFAULT_INTERVIEW_SCORE_PROMPT;
  try {
    const stored = window.localStorage.getItem(`${KEY_PREFIX}${id}`);
    if (stored?.trim()) prompt = stored === PRE_CORRECTION_DEFAULT_SCORE_PROMPT
      ? DEFAULT_INTERVIEW_SCORE_PROMPT : stored;
  } catch { /* Use the built-in prompt when storage is unavailable. */ }
  cache.set(id, prompt);
  return prompt;
}

export function saveInterviewScorePrompt(id: string, prompt: string): void {
  cache.set(id, prompt);
  try { window.localStorage.setItem(`${KEY_PREFIX}${id}`, prompt); } catch { /* Keep in memory. */ }
  notify();
}

export function clearInterviewScorePrompt(id: string): void {
  cache.delete(id);
  settingsCache.delete(id);
  try { window.localStorage.removeItem(`${KEY_PREFIX}${id}`); } catch { /* Deletion already succeeded. */ }
  try { window.localStorage.removeItem(`${SETTINGS_KEY_PREFIX}${id}`); } catch { /* Deletion already succeeded. */ }
  notify();
}

export function useInterviewScorePrompt(id: string): string {
  return useSyncExternalStore(subscribe, () => readInterviewScorePrompt(id), () => DEFAULT_INTERVIEW_SCORE_PROMPT);
}

export function readInterviewScoreSettings(id: string): InterviewChatSettings {
  const cached = settingsCache.get(id);
  if (cached) return cached;
  let settings: InterviewChatSettings = DEFAULT_SCORE_CHAT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(`${SETTINGS_KEY_PREFIX}${id}`);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      const model = record.model && typeof record.model === "object" ? record.model as Record<string, unknown> : null;
      settings = {
        ...(model && typeof model.providerId === "string" && model.providerId
          && typeof model.modelId === "string" && model.modelId
          ? { model: { providerId: model.providerId, modelId: model.modelId } } : {}),
        reasoning: typeof record.reasoning === "string" && LEVELS.has(record.reasoning)
          ? record.reasoning as InterviewChatSettings["reasoning"] : DEFAULT_SCORE_CHAT_SETTINGS.reasoning,
      };
    }
  } catch { /* Use default settings when storage is unavailable. */ }
  settingsCache.set(id, settings);
  return settings;
}

export function saveInterviewScoreSettings(id: string, settings: InterviewChatSettings): void {
  const next = { ...settings };
  settingsCache.set(id, next);
  try { window.localStorage.setItem(`${SETTINGS_KEY_PREFIX}${id}`, JSON.stringify(next)); } catch { /* Keep in memory. */ }
  notify();
}

export function useInterviewScoreSettings(id: string): InterviewChatSettings {
  return useSyncExternalStore(subscribe, () => readInterviewScoreSettings(id), () => DEFAULT_SCORE_CHAT_SETTINGS);
}
