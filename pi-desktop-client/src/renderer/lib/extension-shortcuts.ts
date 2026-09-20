const KEY_ALIASES: Record<string, string> = {
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
  arrowup: "up",
  esc: "escape",
  " ": "space",
};

const EDITING_SHORTCUTS = new Set([
  "ctrl+a",
  "ctrl+c",
  "ctrl+f",
  "ctrl+s",
  "ctrl+shift+c",
  "ctrl+shift+v",
  "ctrl+v",
  "ctrl+x",
  "ctrl+y",
  "ctrl+z",
  "meta+a",
  "meta+c",
  "meta+f",
  "meta+s",
  "meta+shift+c",
  "meta+shift+v",
  "meta+v",
  "meta+x",
  "meta+y",
  "meta+z",
]);

const RESERVED_SHORTCUTS = new Set([
  "alt+f4",
  "ctrl+-",
  "ctrl+0",
  "ctrl+=",
  "ctrl+r",
  "ctrl+shift+i",
  "ctrl+shift+r",
  "ctrl+w",
  "escape",
  "f5",
  "f11",
  "f12",
]);

function normalizedKey(key: string): string {
  const lower = key.toLowerCase();
  return KEY_ALIASES[lower] ?? lower;
}

function normalizedShortcutParts(shortcut: string): { key: string; modifiers: Set<string> } | undefined {
  const parts = shortcut.toLowerCase().split("+").map((part) => part.trim()).filter(Boolean);
  const key = parts.pop();
  if (!key) return undefined;
  const modifiers = new Set(parts.map((part) => part === "cmd" || part === "super" ? "meta" : part === "option" ? "alt" : part));
  return { key: normalizedKey(key), modifiers };
}

export function eventShortcut(event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey">): string {
  return [
    event.ctrlKey ? "ctrl" : "",
    event.altKey ? "alt" : "",
    event.shiftKey ? "shift" : "",
    event.metaKey ? "meta" : "",
    normalizedKey(event.key),
  ].filter(Boolean).join("+");
}

export function matchesExtensionShortcut(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey">,
  shortcut: string,
): boolean {
  const parsed = normalizedShortcutParts(shortcut);
  if (!parsed || normalizedKey(event.key) !== parsed.key) return false;
  return event.ctrlKey === parsed.modifiers.has("ctrl")
    && event.altKey === parsed.modifiers.has("alt")
    && event.shiftKey === parsed.modifiers.has("shift")
    && event.metaKey === parsed.modifiers.has("meta");
}

export function shouldProtectHostShortcut(event: KeyboardEvent): boolean {
  if (event.getModifierState("AltGraph")) return true;
  const shortcut = eventShortcut(event);
  if (RESERVED_SHORTCUTS.has(shortcut)) return true;
  const target = event.target;
  const editable = target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest("[contenteditable='true']"))));
  if (!editable) return false;
  const typingKey = !event.ctrlKey && !event.altKey && !event.metaKey;
  return typingKey || EDITING_SHORTCUTS.has(shortcut);
}
