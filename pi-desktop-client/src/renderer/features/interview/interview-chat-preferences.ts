import { useSyncExternalStore } from "react";
import {
  DEFAULT_INTERVIEW_CHAT_SETTINGS,
  type InterviewChatSettings,
} from "../../../shared/contracts/interview";

const KEY_PREFIX = "interview:chat-settings:v1:";
const LEVELS = new Set(["default", "minimal", "low", "medium", "high", "xhigh", "max"]);
const cache = new Map<string, InterviewChatSettings>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const notify = () => { for (const listener of listeners) listener(); };

export function readInterviewChatSettings(interviewId: string): InterviewChatSettings {
  const cached = cache.get(interviewId);
  if (cached) return cached;
  let settings: InterviewChatSettings = { ...DEFAULT_INTERVIEW_CHAT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(`${KEY_PREFIX}${interviewId}`);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const stored = value as Record<string, unknown>;
      const model = stored.model && typeof stored.model === "object" ? stored.model as Record<string, unknown> : null;
      settings = {
        ...(model && typeof model.providerId === "string" && model.providerId
          && typeof model.modelId === "string" && model.modelId
          ? { model: { providerId: model.providerId, modelId: model.modelId } } : {}),
        reasoning: typeof stored.reasoning === "string" && LEVELS.has(stored.reasoning)
          ? stored.reasoning as InterviewChatSettings["reasoning"] : DEFAULT_INTERVIEW_CHAT_SETTINGS.reasoning,
      };
    }
  } catch { /* Use the default when storage is unavailable or malformed. */ }
  cache.set(interviewId, settings);
  return settings;
}

export function saveInterviewChatSettings(interviewId: string, settings: InterviewChatSettings): void {
  cache.set(interviewId, { ...settings });
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${interviewId}`, JSON.stringify(settings));
  } catch {
    // An unavailable storage area must not block the current interview.
  }
  notify();
}

export function clearInterviewChatSettings(interviewId: string): void {
  cache.delete(interviewId);
  try {
    window.localStorage.removeItem(`${KEY_PREFIX}${interviewId}`);
  } catch {
    // Storage cleanup must not turn a completed database deletion into an error.
  }
  notify();
}

export function useInterviewChatSettings(interviewId: string): InterviewChatSettings {
  return useSyncExternalStore(subscribe, () => readInterviewChatSettings(interviewId),
    () => DEFAULT_INTERVIEW_CHAT_SETTINGS);
}
