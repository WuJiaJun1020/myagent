import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { rendererModuleDefinitions } from "../../modules/renderer-module-registry";
import { useUiStore } from "../../stores/ui-store";

type SidebarProps = {
  children: ReactNode;
};

/** The shared sidebar frame. Business navigation is supplied by the active module. */
export function Sidebar({ children }: SidebarProps) {
  const activeModule = useUiStore((state) => state.activeModule);
  const setActiveModule = useUiStore((state) => state.setActiveModule);

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-copy"><strong>Pi Desktop</strong></span>
        <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
      </div>

      <nav className="sidebar-module-switcher" aria-label="功能区域">
        {rendererModuleDefinitions.map((module) => {
          const Icon = module.icon;
          const preload = () => {
            void module.preload?.().catch((error: unknown) => {
              console.warn(`无法预加载 ${module.id} 模块`, error);
            });
          };
          return (
            <button
              className={activeModule === module.id ? "active" : ""}
              type="button"
              key={module.id}
              onFocus={preload}
              onPointerEnter={preload}
              onClick={() => setActiveModule(module.id)}
            >
              <Icon size={17} />
              <span><strong>{module.navigationLabel}</strong><small>{module.navigationDescription}</small></span>
            </button>
          );
        })}
      </nav>

      {children}
    </aside>
  );
}
