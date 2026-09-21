import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import type { ProductModuleId } from "../../platform/shared/product-module";

type RendererModuleSlotName = "sidebar" | "topbar" | "workspace" | "detail" | "overlays";

type RendererModuleSlotProps = {
  moduleId: ProductModuleId;
  slot: RendererModuleSlotName;
  children: ReactNode;
};

type RendererModuleSlotState = {
  error: Error | null;
};

class RendererModuleErrorBoundary extends Component<RendererModuleSlotProps, RendererModuleSlotState> {
  state: RendererModuleSlotState = { error: null };

  static getDerivedStateFromError(error: Error): RendererModuleSlotState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Renderer module slot failed: ${this.props.moduleId}/${this.props.slot}`, error, info);
  }

  componentDidUpdate(previous: RendererModuleSlotProps): void {
    if ((previous.moduleId !== this.props.moduleId || previous.slot !== this.props.slot) && this.state.error) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <section className={`renderer-module-error ${this.props.slot}`} role="alert">
          <div>
            <strong>此模块区域暂时无法显示</strong>
            <span>{this.state.error.message}</span>
          </div>
          <button type="button" onClick={() => window.location.reload()}>重新加载界面</button>
        </section>
      );
    }
    return this.props.children;
  }
}

function ModuleLoading({ slot }: { slot: RendererModuleSlotName }) {
  if (slot === "overlays") return null;
  return <div className={`renderer-module-loading ${slot}`} aria-label="正在加载模块" />;
}

/** Suspense and error isolation for one active-module surface. */
export function RendererModuleSlot(props: RendererModuleSlotProps) {
  return (
    <RendererModuleErrorBoundary {...props}>
      <Suspense fallback={<ModuleLoading slot={props.slot} />}>{props.children}</Suspense>
    </RendererModuleErrorBoundary>
  );
}
