export type UiFontFamily = "system" | "noto" | "yahei" | "segoe";
export type ContentFontFamily = "ui" | "noto" | "wenkai" | "sans" | "serif";
export type CodeFontFamily = "jetbrains" | "maple" | "consolas" | "cascadia" | "system";

export const DEFAULT_UI_FONT_SIZE = 13;
export const DEFAULT_CONTENT_FONT_SIZE = 13;
export const DEFAULT_CODE_FONT_SIZE = 12;

export const uiFontOptions: Array<{ value: UiFontFamily; label: string }> = [
  { value: "system", label: "系统默认" },
  { value: "noto", label: "Noto Sans SC（内置）" },
  { value: "yahei", label: "微软雅黑" },
  { value: "segoe", label: "Segoe UI" },
];

export const contentFontOptions: Array<{ value: ContentFontFamily; label: string }> = [
  { value: "ui", label: "跟随界面字体" },
  { value: "noto", label: "Noto Sans SC（内置）" },
  { value: "wenkai", label: "霞鹜文楷（内置）" },
  { value: "sans", label: "系统无衬线" },
  { value: "serif", label: "阅读衬线" },
];

export const codeFontOptions: Array<{ value: CodeFontFamily; label: string }> = [
  { value: "jetbrains", label: "JetBrains Mono（内置）" },
  { value: "maple", label: "Maple Mono（内置）" },
  { value: "consolas", label: "Consolas" },
  { value: "cascadia", label: "Cascadia Mono" },
  { value: "system", label: "系统等宽" },
];

const uiFontStacks: Record<UiFontFamily, string> = {
  system: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
  noto: '"Noto Sans SC Variable", "Microsoft YaHei UI", sans-serif',
  yahei: '"Microsoft YaHei UI", "Microsoft YaHei", ui-sans-serif, sans-serif',
  segoe: '"Segoe UI", "Microsoft YaHei UI", ui-sans-serif, sans-serif',
};

const contentFontStacks: Record<ContentFontFamily, string> = {
  ui: "var(--font-ui)",
  noto: '"Noto Sans SC Variable", "Microsoft YaHei UI", sans-serif',
  wenkai: '"LXGW WenKai", "Noto Sans SC Variable", "Microsoft YaHei UI", sans-serif',
  sans: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
  serif: '"Noto Serif SC", "Source Han Serif SC", SimSun, serif',
};

const codeFontStacks: Record<CodeFontFamily, string> = {
  jetbrains: '"JetBrains Mono Variable", "Noto Sans SC Variable", "Microsoft YaHei UI", monospace',
  maple: '"Maple Mono", "Noto Sans SC Variable", "Microsoft YaHei UI", monospace',
  consolas: 'Consolas, "Microsoft YaHei UI", monospace',
  cascadia: '"Cascadia Mono", "Cascadia Code", Consolas, "Microsoft YaHei UI", monospace',
  system: 'ui-monospace, "SFMono-Regular", Consolas, "Microsoft YaHei UI", monospace',
};

export function resolveCodeFontFamily(font: CodeFontFamily): string {
  return codeFontStacks[font];
}

export function loadCodeFont(font: CodeFontFamily, size: number): Promise<FontFace[]> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve([]);
  return document.fonts.load(`${size}px ${codeFontStacks[font]}`, "Pi 中文 0123 =>");
}

export function applyTypographySettings(settings: {
  uiFontFamily: UiFontFamily;
  contentFontFamily: ContentFontFamily;
  codeFontFamily: CodeFontFamily;
  uiFontSize: number;
  contentFontSize: number;
  codeFontSize: number;
}): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--font-ui", uiFontStacks[settings.uiFontFamily]);
  root.style.setProperty("--font-content", contentFontStacks[settings.contentFontFamily]);
  root.style.setProperty("--font-code", codeFontStacks[settings.codeFontFamily]);
  root.style.setProperty("--ui-font-adjust", `${settings.uiFontSize - DEFAULT_UI_FONT_SIZE}px`);
  root.style.setProperty("--content-font-size", `${settings.contentFontSize}px`);
  root.style.setProperty("--code-font-size", `${settings.codeFontSize}px`);
}
