import { AppProviders } from "./AppProviders";
import { WorkspacePage } from "../pages/WorkspacePage";

export function WorkspaceApplication() {
  return <AppProviders><WorkspacePage /></AppProviders>;
}
