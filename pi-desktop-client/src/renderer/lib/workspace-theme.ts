/** One source for workspace CSS, appearance previews and terminal colors. */
export type PaletteId = "gray" | "sand" | "mist";
export type AccentId = "theme" | "blue" | "green" | "violet";
export type ThemeMode = "light" | "dark";
export const paletteOptions: { value: PaletteId; label: string; description: string }[] = [
  { value: "gray", label: "简约灰", description: "中性、清晰" },
  { value: "sand", label: "暖砂", description: "温暖、柔和" },
  { value: "mist", label: "雾蓝", description: "清冷、沉静" },
];
export const accentOptions: { value: AccentId; label: string }[] = [
  { value: "theme", label: "随主题" }, { value: "blue", label: "蓝色" },
  { value: "green", label: "绿色" }, { value: "violet", label: "紫色" },
];
export function normalizePalette(value: unknown): PaletteId {
  return paletteOptions.some(option => option.value === value) ? value as PaletteId : "gray";
}
export function normalizeAccent(value: unknown): AccentId {
  return accentOptions.some(option => option.value === value) ? value as AccentId : "theme";
}
const keys = ["bg-app", "bg-sidebar", "bg-panel", "bg-elevated", "bg-hover", "bg-selected", "border", "border-strong", "text", "text-soft", "text-muted", "accent", "accent-strong"] as const;
type TokenName = typeof keys[number] | "accent-ink" | "accent-soft" | "green" | "amber" | "red";
export type ThemeTokens = Record<TokenName, string>;
const colors: Record<PaletteId, Record<ThemeMode, string[]>> = {
  gray: {
    light: ["#ffffff", "#f5f5f4", "#f7f7f6", "#ffffff", "#e7e8ea", "#dcdfe3", "#e3e4e6", "#cfd1d5", "#24262b", "#535963", "#636a75", "#355fa2", "#274c88"],
    dark: ["#202123", "#191a1c", "#292a2d", "#303135", "#323438", "#3a3d42", "#35373c", "#494c52", "#eceef1", "#b7bcc5", "#959ca7", "#83a9ed", "#abc6f5"],
  },
  sand: {
    light: ["#fcfaf6", "#f2eee7", "#f7f3ec", "#fffdf9", "#e8e1d6", "#ded4c5", "#e3dbce", "#cfc2af", "#302b25", "#61574b", "#706455", "#875331", "#6e4025"],
    dark: ["#25231f", "#1e1c19", "#2e2b26", "#36322c", "#3c3730", "#484035", "#413a31", "#5b5042", "#f1ebe1", "#c4b8a8", "#a69a8a", "#dbac80", "#ecc6a2"],
  },
  mist: {
    light: ["#f8fafc", "#eef2f6", "#f2f5f8", "#ffffff", "#dfe7ef", "#d1deea", "#dce4ec", "#bdccdb", "#24313e", "#4d6071", "#5b6d80", "#326a85", "#24556e"],
    dark: ["#1d252e", "#171e26", "#252f3a", "#2c3845", "#324152", "#3d5063", "#354455", "#4a6075", "#e8eff5", "#b1c1d0", "#8fa5b9", "#85b9d8", "#b0d5e9"],
  },
};
const accents: Record<Exclude<AccentId, "theme">, Record<ThemeMode, [string, string]>> = {
  blue: { light: ["#355fa2", "#274c88"], dark: ["#83a9ed", "#abc6f5"] },
  green: { light: ["#28704f", "#1c593d"], dark: ["#83c6a3", "#adddbf"] },
  violet: { light: ["#7052a3", "#573c85"], dark: ["#b5a0e5", "#d0c0f1"] },
};
export function getThemeTokens(palette: PaletteId, mode: ThemeMode, accent: AccentId = "theme"): ThemeTokens {
  const tokens = Object.fromEntries(keys.map((key, index) => [key, colors[palette][mode][index]])) as ThemeTokens;
  if (accent !== "theme") [tokens.accent, tokens["accent-strong"]] = accents[accent][mode];
  return { ...tokens,
    "accent-ink": mode === "light" ? "#ffffff" : "#17212b",
    "accent-soft": `color-mix(in srgb, ${tokens.accent} ${mode === "light" ? 9 : 13}%, transparent)`,
    green: mode === "light" ? "#237b56" : "#74c7a1",
    amber: mode === "light" ? "#936316" : "#e4bc77",
    red: mode === "light" ? "#b33e4c" : "#f08d95",
  };
}
export function themeStyle(palette: PaletteId, mode: ThemeMode, accent: AccentId = "theme"): Record<string, string> {
  return Object.fromEntries(Object.entries(getThemeTokens(palette, mode, accent)).map(([key, value]) => [`--${key}`, value]));
}
export function workspaceThemeCss(): string {
  return paletteOptions.flatMap(({ value: palette }) => (["light", "dark"] as const).flatMap(mode =>
    accentOptions.map(({ value: accent }) => {
      const declarations = Object.entries(themeStyle(palette, mode, accent)).map(([key, value]) => `${key}:${value}`).join(";");
      return ["agent", "interview", "knowledge-studio"].map(workspace => `html[data-workspace="${workspace}"][data-palette="${palette}"][data-theme="${mode}"][data-accent="${accent}"]{${declarations};color-scheme:${mode}}`).join("\n");
    }),
  )).join("\n");
}
export function applyWorkspaceAppearance(root: HTMLElement, palette: PaletteId, accent: AccentId, mode: ThemeMode, animation: boolean): void {
  root.dataset.palette = palette;
  root.dataset.accent = accent;
  root.dataset.theme = mode;
  root.dataset.motion = animation ? "system" : "reduced";
  root.style.colorScheme = mode;
}
