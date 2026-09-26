import type { ProductModuleId } from "../../platform/shared/product-module";

export type AgentView = "activity" | "files" | "review" | "mcp" | "memory";
export type InterviewView = "dashboard" | "records" | "jobs" | "question-bank" | "algorithms" | "session";
export type KnowledgeStudioView = "studio";

/** Each product module owns its page state; switching modules must not overwrite it. */
export type ModuleViews = {
  agent: AgentView;
  interview: InterviewView;
  "knowledge-studio": KnowledgeStudioView;
};

export type ModuleView<ModuleId extends ProductModuleId = ProductModuleId> = ModuleViews[ModuleId];
