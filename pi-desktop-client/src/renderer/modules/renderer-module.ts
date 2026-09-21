import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { ProductModuleId } from "../../platform/shared/product-module";
import type { ModuleView } from "./module-navigation";

export type RendererModuleLayout = {
  detailVariant: "default" | "review";
  /** Reclaim the module breadcrumb row for a focused workspace. */
  topbarSuppressed?: boolean;
  /** Reclaim navigation width without changing the user's saved sidebar toggle. */
  sidebarSuppressed?: boolean;
  /** Reclaim detail width without changing the user's saved detail toggle. */
  detailSuppressed?: boolean;
};

export type RendererModuleDefinition<ModuleId extends ProductModuleId = ProductModuleId> = {
  id: ModuleId;
  title: string;
  navigationLabel: string;
  navigationDescription: string;
  icon: LucideIcon;
  Sidebar: ComponentType;
  TopBar: ComponentType;
  Workspace: ComponentType;
  DetailPanel: ComponentType;
  /** Keep local workspace state and background tasks alive after the first visit. */
  keepWorkspaceAlive?: boolean;
  /** Warm a lazy module before activation; it must not mutate business state. */
  preload?: () => Promise<unknown>;
  /** Transient UI that only exists while this module is active. */
  Overlays?: ComponentType;
  /** Critical module UI that must remain mounted while another module is active. */
  PersistentOverlays?: ComponentType;
  resolveLayout: (view: ModuleView<ModuleId>) => RendererModuleLayout;
};
