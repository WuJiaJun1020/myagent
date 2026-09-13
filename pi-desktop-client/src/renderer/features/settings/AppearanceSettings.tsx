import { Check, Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
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

function ThemePreview({ variant }: { variant: ThemePreference }) {
  return (
    <span className={`theme-preview ${variant}`} aria-hidden="true">
      <i className="theme-preview-sidebar" />
      <i className="theme-preview-window">
        <b /><b /><b />
      </i>
    </span>
  );
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
      <SettingsGroup title="主题" description="配色立即应用，并保存在此电脑上。">
        <div className="theme-choice-grid" role="radiogroup" aria-label="应用主题">
          {themeOptions.map((option) => (
            <button
              className={`theme-choice ${theme === option.value ? "active" : ""}`}
              type="button"
              role="radio"
              aria-checked={theme === option.value}
              onClick={() => setTheme(option.value)}
              key={option.value}
            >
              <ThemePreview variant={option.value} />
              <span><strong>{option.label}</strong><small>{option.description}</small></span>
              {theme === option.value && <i className="theme-choice-check"><Check size={12} /></i>}
            </button>
          ))}
        </div>
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
