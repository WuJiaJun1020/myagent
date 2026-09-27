/** Markdown escapes local paths as URI references; file URLs are decoded by the main process. */
export function browserLinkTarget(href: string): string {
  if (/^(https?:|file:)/i.test(href)) return href;
  try { return decodeURIComponent(href); } catch { return href; }
}
