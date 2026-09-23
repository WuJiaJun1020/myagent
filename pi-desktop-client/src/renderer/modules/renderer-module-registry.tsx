import { Bot, Factory, ScanFace } from "lucide-react";
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

const loadKnowledgeStudioRendererModule = () => import("./knowledge-studio/KnowledgeStudioRendererModule");
const KnowledgeStudioSidebar = lazy(async () => ({ default: (await loadKnowledgeStudioRendererModule()).KnowledgeStudioSidebar }));
const KnowledgeStudioTopBar = lazy(async () => ({ default: (await loadKnowledgeStudioRendererModule()).KnowledgeStudioTopBar }));
const KnowledgeStudioWorkspace = lazy(async () => ({ default: (await loadKnowledgeStudioRendererModule()).KnowledgeStudioWorkspace }));
const KnowledgeStudioDetailPanel = lazy(async () => ({ default: (await loadKnowledgeStudioRendererModule()).KnowledgeStudioDetailPanel }));

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
  resolveLayout: (view) => {
    const focused = view === "algorithms" || view === "question-bank";
    return {
      detailVariant: "default",
      topbarSuppressed: focused,
      sidebarSuppressed: focused,
      detailSuppressed: focused,
    };
  },
};

const knowledgeStudioModule: RendererModuleDefinition<"knowledge-studio"> = {
  id: "knowledge-studio",
  title: "知识工坊",
  navigationLabel: "知识工坊",
  navigationDescription: "资料转题库",
  icon: Factory,
  Sidebar: KnowledgeStudioSidebar,
  TopBar: KnowledgeStudioTopBar,
  Workspace: KnowledgeStudioWorkspace,
  DetailPanel: KnowledgeStudioDetailPanel,
  keepWorkspaceAlive: true,
  preload: loadKnowledgeStudioRendererModule,
  resolveLayout: () => ({ detailVariant: "default", detailSuppressed: true }),
};

const rendererModuleRegistry = {
  agent: agentModule,
  interview: interviewModule,
  "knowledge-studio": knowledgeStudioModule,
} satisfies { [ModuleId in ProductModuleId]: RendererModuleDefinition<ModuleId> };

export const rendererModuleDefinitions = PRODUCT_MODULE_IDS.map((moduleId) => rendererModuleRegistry[moduleId]);

export function getRendererModule<ModuleId extends ProductModuleId>(
  moduleId: ModuleId,
): RendererModuleDefinition<ModuleId> {
  // The `satisfies` mapping above proves the ID-to-definition relationship;
  // TypeScript does not retain that correlation for generic indexed access.
  return rendererModuleRegistry[moduleId] as unknown as RendererModuleDefinition<ModuleId>;
}
