import { Bot, ScanFace } from "lucide-react";
import { lazy } from "react";
import { PRODUCT_MODULE_IDS, type ProductModuleId } from "../../platform/shared/product-module";
import {
  AgentDetailPanel,
  AgentOverlays,
  AgentSidebar,
  AgentTopBar,
  AgentWorkspace,
} from "./agent/AgentRendererModule";
import type { RendererModuleDefinition } from "./renderer-module";

// Importing these wrappers is intentionally deferred. The interview business
// UI and its stores do not enter the initial Agent renderer chunk.
const loadInterviewRendererModule = () => import("./interview/InterviewRendererModule");
const InterviewSidebar = lazy(async () => {
  const module = await loadInterviewRendererModule();
  return { default: module.InterviewSidebar };
});
const InterviewTopBar = lazy(async () => {
  const module = await loadInterviewRendererModule();
  return { default: module.InterviewTopBar };
});
const InterviewWorkspace = lazy(async () => {
  const module = await loadInterviewRendererModule();
  return { default: module.InterviewModuleWorkspace };
});
const InterviewDetailPanel = lazy(async () => {
  const module = await loadInterviewRendererModule();
  return { default: module.InterviewModuleDetailPanel };
});

const agentModule: RendererModuleDefinition<"agent"> = {
  id: "agent",
  title: "Agent 工作区",
  navigationLabel: "Agent 工作区",
  navigationDescription: "会话与项目工具",
  icon: Bot,
  Sidebar: AgentSidebar,
  TopBar: AgentTopBar,
  Workspace: AgentWorkspace,
  DetailPanel: AgentDetailPanel,
  keepWorkspaceAlive: true,
  PersistentOverlays: AgentOverlays,
  resolveLayout: (view) => ({ detailVariant: view === "review" ? "review" : "default" }),
};

const interviewModule: RendererModuleDefinition<"interview"> = {
  id: "interview",
  title: "智能面试",
  navigationLabel: "智能面试",
  navigationDescription: "独立业务模块",
  icon: ScanFace,
  Sidebar: InterviewSidebar,
  TopBar: InterviewTopBar,
  Workspace: InterviewWorkspace,
  DetailPanel: InterviewDetailPanel,
  keepWorkspaceAlive: true,
  preload: loadInterviewRendererModule,
  resolveLayout: (view) => ({
    detailVariant: "default",
    topbarSuppressed: view === "algorithms",
    sidebarSuppressed: view === "algorithms",
    detailSuppressed: view === "algorithms",
  }),
};

const rendererModuleRegistry = {
  agent: agentModule,
  interview: interviewModule,
} satisfies { [ModuleId in ProductModuleId]: RendererModuleDefinition<ModuleId> };

export const rendererModuleDefinitions = PRODUCT_MODULE_IDS.map((moduleId) => rendererModuleRegistry[moduleId]);

export function getRendererModule<ModuleId extends ProductModuleId>(
  moduleId: ModuleId,
): RendererModuleDefinition<ModuleId> {
  // The `satisfies` mapping above proves the ID-to-definition relationship;
  // TypeScript does not retain that correlation for generic indexed access.
  return rendererModuleRegistry[moduleId] as unknown as RendererModuleDefinition<ModuleId>;
}
