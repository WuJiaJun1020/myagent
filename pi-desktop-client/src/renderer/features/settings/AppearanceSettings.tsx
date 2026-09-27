import { paletteOptions, accentOptions, themeStyle, type PaletteId, type AccentId, type ThemeMode } from "../../lib/workspace-theme";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  codeFontOptions,
  contentFontOptions,
  uiFontOptions,
  type CodeFontFamily,
  type ContentFontFamily,
  type UiFontFamily,
} from "../../lib/typography";
import { useSettingsStore, type ThemePreference } from "../../stores/settings-store";
import { SettingsGroup, SettingsRow, SettingsSwitch } from "./SettingsPrimitives";

const themeOptions: Array<{ value: ThemePreference; label: string; description: string }> = [
  { value: "system", label: "跟随系统", description: "随 Windows 配色自动切换" },
  { value: "light", label: "浅色", description: "始终使用浅色界面" },
  { value: "dark", label: "深色", description: "始终使用深色界面" },
];

export function WorkspaceThemePreview({ palette, mode, accent }: { palette: PaletteId; mode: ThemeMode; accent: AccentId }) {
  return <span className="theme-preview" style={themeStyle(palette, mode, accent) as CSSProperties} aria-hidden="true">
    <span className="theme-preview-sidebar"><b>Pi</b><i>会话</i><span>文件</span></span>
    <span className="theme-preview-window"><span className="theme-preview-message">检查这段代码</span><span>已找到需要调整的地方。</span><code>+ return result;</code><span className="theme-preview-composer">描述任务…<b>↑</b></span></span>
  </span>;
}

function navigateThemeChoices(event: KeyboardEvent<HTMLDivElement>): void {
  const directions: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (!(event.key in directions) && event.key !== "Home" && event.key !== "End") return;
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]'));
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + directions[event.key] + buttons.length) % buttons.length;
  buttons[next].focus(); buttons[next].click();
}

function FontSizeControl({ label, value, min, max, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const commit = (): void => {
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.min(max, Math.max(min, parsed));
    setDraft(String(next));
    onChange(next);
  };

  return (
    <span className="font-size-control">
      <button type="button" aria-label={`减小${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}><Minus size={13} /></button>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={1}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          else if (event.key === "Escape") {
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
      />
      <span>px</span>
      <button type="button" aria-label={`增大${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={13} /></button>
    </span>
  );
}

export function AppearanceSettings() {
  const palette = useSettingsStore((state) => state.palette);
  const accent = useSettingsStore((state) => state.accent);
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const setPalette = useSettingsStore((state) => state.setPalette);
  const setAccent = useSettingsStore((state) => state.setAccent);
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const animationEnabled = useSettingsStore((state) => state.animationEnabled);
  const setAnimationEnabled = useSettingsStore((state) => state.setAnimationEnabled);
  const uiFontFamily = useSettingsStore((state) => state.uiFontFamily);
  const contentFontFamily = useSettingsStore((state) => state.contentFontFamily);
  const codeFontFamily = useSettingsStore((state) => state.codeFontFamily);
  const uiFontSize = useSettingsStore((state) => state.uiFontSize);
  const contentFontSize = useSettingsStore((state) => state.contentFontSize);
  const codeFontSize = useSettingsStore((state) => state.codeFontSize);
  const setUiFontFamily = useSettingsStore((state) => state.setUiFontFamily);
  const setContentFontFamily = useSettingsStore((state) => state.setContentFontFamily);
  const setCodeFontFamily = useSettingsStore((state) => state.setCodeFontFamily);
  const setUiFontSize = useSettingsStore((state) => state.setUiFontSize);
  const setContentFontSize = useSettingsStore((state) => state.setContentFontSize);
  const setCodeFontSize = useSettingsStore((state) => state.setCodeFontSize);
  const resetTypography = useSettingsStore((state) => state.resetTypography);

  return (
    <>
      <SettingsGroup title="模式" description="明暗模式立即应用，并保存在此电脑上。">
        <div className="theme-choice-grid" role="radiogroup" aria-label="明暗模式" onKeyDown={navigateThemeChoices}>
          {themeOptions.map((option) => (
            <button
              className={`theme-choice ${theme === option.value ? "active" : ""}`}
              type="button"
              role="radio"
              tabIndex={theme === option.value ? 0 : -1}
              aria-checked={theme === option.value}
              onClick={() => setTheme(option.value)}
              key={option.value}
            >
              <WorkspaceThemePreview palette={palette} mode={option.value === "system" ? resolvedTheme : option.value} accent={accent} />
              <span><strong>{option.label}</strong><small>{option.description}</small></span>
              {theme === option.value && <i className="theme-choice-check"><Check size={12} /></i>}
            </button>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title="配色主题" description="目前应用于 Agent 工作区；智慧面试和知识工坊将在后续阶段统一。">
        <div className="theme-choice-grid" role="radiogroup" aria-label="配色主题" onKeyDown={navigateThemeChoices}>
          {paletteOptions.map(option => <button key={option.value} type="button" className={`theme-choice ${palette === option.value ? "active" : ""}`} role="radio" tabIndex={palette === option.value ? 0 : -1} aria-checked={palette === option.value} onClick={() => setPalette(option.value)}>
            <WorkspaceThemePreview palette={option.value} mode={resolvedTheme} accent={accent} />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
            {palette === option.value && <i className="theme-choice-check"><Check size={12} /></i>}
          </button>)}
        </div>
        <SettingsRow title="强调色" description="用于主要操作、链接与键盘焦点。">
          <select aria-label="强调色" value={accent} onChange={event => setAccent(event.target.value as AccentId)}>
            {accentOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="字体与字号" description="分别调整界面控件、聊天内容和代码区域，修改后立即生效。">
        <SettingsRow title="界面字体" description="用于菜单、侧边栏、按钮和设置页面；标有“内置”的字体可离线使用。">
          <select value={uiFontFamily} onChange={(event) => setUiFontFamily(event.target.value as UiFontFamily)} aria-label="界面字体">
            {uiFontOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </SettingsRow>
        <SettingsRow title="界面字号" description="以 13px 为默认基准，其他界面文字会按层级同步调整。">
          <FontSizeControl label="界面字号" value={uiFontSize} min={11} max={17} onChange={setUiFontSize} />
        </SettingsRow>
        <SettingsRow title="内容字体" description="用于用户消息和 Agent 回复正文；霞鹜文楷更适合长文阅读。">
          <select value={contentFontFamily} onChange={(event) => setContentFontFamily(event.target.value as ContentFontFamily)} aria-label="内容字体">
            {contentFontOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </SettingsRow>
        <SettingsRow title="内容字号" description="调整聊天正文的基础字号。">
          <FontSizeControl label="内容字号" value={contentFontSize} min={12} max={20} onChange={setContentFontSize} />
        </SettingsRow>
        <SettingsRow title="代码字体" description="用于代码块、Diff、编辑器和集成终端；中文字符自动使用内置中文字体补全。">
          <select value={codeFontFamily} onChange={(event) => setCodeFontFamily(event.target.value as CodeFontFamily)} aria-label="代码字体">
            {codeFontOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </SettingsRow>
        <SettingsRow title="代码字号" description="调整代码视图和终端的基础字号。">
          <FontSizeControl label="代码字号" value={codeFontSize} min={10} max={18} onChange={setCodeFontSize} />
        </SettingsRow>
        <div className="typography-preview">
          <div>
            <span>界面预览 · Pi Desktop</span>
            <p>内容预览：清晰的文字让阅读和协作更轻松。</p>
            <code>const message = "Hello, Pi";</code>
          </div>
          <button type="button" onClick={resetTypography}><RotateCcw size={13} />恢复默认</button>
        </div>
      </SettingsGroup>

      <SettingsGroup title="界面">
        <SettingsRow title="界面动画" description="关闭后减少面板切换和列表动效。">
          <SettingsSwitch
            checked={animationEnabled}
            label="切换界面动画"
            onChange={setAnimationEnabled}
          />
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}
