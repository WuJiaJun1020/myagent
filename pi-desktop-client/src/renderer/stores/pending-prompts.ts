import { create } from "zustand";
import type { AgentMessage } from "../../shared/contracts/agent-events";
import { useAgentStore } from "./agent-store";

type PendingPrompt = { id: string; sessionId: string; text: string; timestamp: number; knownIds: string[]; queued: boolean };
export function reconcilePrompts(pending: PendingPrompt[], sessionId: string | null, messages: Record<string, AgentMessage>): PendingPrompt[] {
  const claimed = new Set<string>();
  const remaining = pending.filter(prompt => {
    if (prompt.sessionId !== sessionId) return true;
    const match = Object.values(messages).find(message => message.role === "user" && !claimed.has(message.id) && !prompt.knownIds.includes(message.id)
      && message.content.filter(block => block.type === "text").map(block => block.text).join("\n").trim() === prompt.text);
    if (!match) return true;
    claimed.add(match.id);
    return false;
  });
  return remaining.map(prompt => prompt.sessionId === sessionId && claimed.size ? { ...prompt, knownIds: [...prompt.knownIds, ...claimed] } : prompt);
}
export const usePendingPrompts = create<{
  pending: PendingPrompt[];
  add: (sessionId: string, text: string, queued: boolean) => string;
  remove: (id: string) => void;
}>((set) => ({
  pending: [],
  add: (sessionId, text, queued) => {
    const id = `pending:${crypto.randomUUID()}`;
    set(state => ({ pending: [...state.pending, { id, sessionId, text, queued, timestamp: Date.now(), knownIds: Object.keys(useAgentStore.getState().messagesById) }] }));
    return id;
  },
  remove: id => set(state => ({ pending: state.pending.filter(prompt => prompt.id !== id) })),
}));
useAgentStore.subscribe(state => {
  const previous = usePendingPrompts.getState().pending;
  if (!previous.length) return;
  const pending = reconcilePrompts(previous, state.activeSessionId, state.messagesById);
  if (pending.length !== previous.length) usePendingPrompts.setState({ pending });
});
