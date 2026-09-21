import type { ProductModuleId } from "../../platform/shared/product-module";

export type AgentView = "activity" | "files" | "review" | "mcp" | "memory";
export type InterviewView = "dashboard" | "jobs" | "question-bank" | "algorithms" | "session";

/** Each product module owns its page state; switching modules must not overwrite it. */
export type ModuleViews = {
  agent: AgentView;
  interview: InterviewView;
};

export type ModuleView<ModuleId extends ProductModuleId = ProductModuleId> = ModuleViews[ModuleId];
