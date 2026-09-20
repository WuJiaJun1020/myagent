import type { QueuedMessages } from "../services/agent-gateway";

/**
 * Mirrors Pi's interactive-mode abort behavior: steering messages are restored
 * before follow-up messages, followed by any text that was already in the editor.
 */
export function restoreQueuedMessages(queue: QueuedMessages, currentDraft: string): string {
  const queuedText = [...queue.steering, ...queue.followUp]
    .filter((message) => message.trim().length > 0)
    .join("\n\n");
  return [queuedText, currentDraft]
    .filter((text) => text.trim().length > 0)
    .join("\n\n");
}
