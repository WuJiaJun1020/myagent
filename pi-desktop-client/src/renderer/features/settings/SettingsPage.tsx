import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Bot, ListChecks, MonitorCog, Palette, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useUiStore } from "../../stores/ui-store";
import { AgentSettings } from "./AgentSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { BehaviorSettings } from "./BehaviorSettings";
import { RuntimeSettings } from "./RuntimeSettings";
import { SecuritySettings } from "./SecuritySettings";

type SettingsSectionId = "appearance" | "agent" | "behavior" | "runtime" | "security";

const sections = [
  { id: "appearance", label: "外观", description: "主题、字体与界面", icon: Palette },
  { id: "agent", label: "模型与 Agent", description: "模型、推理与认证", icon: Bot },
  { id: "behavior", label: "任务行为", description: "队列、上下文与重试", icon: ListChecks },
  { id: "runtime", label: "运行时与资源", description: "Pi 状态、资源与隐私", icon: MonitorCog },
  { id: "security", label: "安全与信任", description: "项目资源与信任策略", icon: ShieldCheck },
] as const;

const sectionContent: Record<SettingsSectionId, () => React.JSX.Element> = {
  appearance: AppearanceSettings,
  agent: AgentSettings,
  behavior: BehaviorSettings,
  runtime: RuntimeSettings,
  security: SecuritySettings,
};

export function SettingsPage() {
  const open = useUiStore((state) => state.settingsOpen);
  const providerSettingsOpen = useUiStore((state) => state.providerSettingsOpen);
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setOpen = useUiStore((state) => state.setSettingsOpen);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("appearance");
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => pageRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocus?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !providerSettingsOpen) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, providerSettingsOpen, setOpen]);

  const active = sections.find((section) => section.id === activeSection) ?? sections[0];
  const ActiveContent = sectionContent[active.id];
  const ActiveIcon = active.icon;

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          ref={pageRef}
          className="settings-page"
          data-navigation-open={sidebarOpen}
          aria-labelledby="settings-page-title"
          tabIndex={-1}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {sidebarOpen && (
            <aside className="settings-navigation">
              <button className="settings-back-button" type="button" onClick={() => setOpen(false)}>
                <ArrowLeft size={15} />返回应用
              </button>
              <span className="settings-navigation-label">设置</span>
              <nav aria-label="设置分类">
                {sections.map(({ id, label, icon: Icon }) => (
                  <button
                    className={activeSection === id ? "active" : ""}
                    type="button"
                    aria-current={activeSection === id ? "page" : undefined}
                    onClick={() => setActiveSection(id)}
                    key={id}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>
            </aside>
          )}

          <main className="settings-page-content">
            <div className="settings-page-inner">
              {!sidebarOpen && (
                <button className="settings-inline-back" type="button" onClick={() => setOpen(false)}>
                  <ArrowLeft size={14} />返回应用
                </button>
              )}
              <header className="settings-page-heading">
                <span><ActiveIcon size={19} /></span>
                <div>
                  <h1 id="settings-page-title">{active.label}</h1>
                  <p>{active.description}</p>
                </div>
              </header>
              <ActiveContent />
            </div>
          </main>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
