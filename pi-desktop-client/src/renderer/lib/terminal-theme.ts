import type { ITheme } from "@xterm/xterm";
import { getThemeTokens, type PaletteId, type AccentId, type ThemeMode } from "./workspace-theme";
const TERMINAL_ANSI_COLORS: Record<"dark" | "light", ITheme> = {
  dark: {
    black: "#1b222c",
    red: "#ef7777",
    green: "#54c995",
    yellow: "#e3b35c",
    blue: "#79a7ef",
    magenta: "#ae91ef",
    cyan: "#63c5da",
    white: "#d3dae4",
    brightBlack: "#707b8b",
    brightRed: "#ff9292",
    brightGreen: "#75dbaa",
    brightYellow: "#f0c979",
    brightBlue: "#9bc0f5",
    brightMagenta: "#c4aaf5",
    brightCyan: "#82d5e5",
    brightWhite: "#f3f5f8",
  },
  light: {
    black: "#303b48",
    red: "#c34d54",
    green: "#21875d",
    yellow: "#a66c16",
    blue: "#326bb3",
    magenta: "#6e5bd2",
    cyan: "#147d8f",
    white: "#e8ecf1",
    brightBlack: "#738091",
    brightRed: "#d66067",
    brightGreen: "#29986a",
    brightYellow: "#b77b20",
    brightBlue: "#417dc4",
    brightMagenta: "#806dde",
    brightCyan: "#208da0",
    brightWhite: "#ffffff",
  },
};

export function getTerminalTheme(palette: PaletteId, mode: ThemeMode, accent: AccentId): ITheme {
  const tokens = getThemeTokens(palette, mode, accent);
  return { ...TERMINAL_ANSI_COLORS[mode], background: tokens["bg-app"], foreground: tokens.text,
    cursor: tokens.accent, cursorAccent: tokens["bg-app"], selectionBackground: tokens["bg-selected"] };
}
