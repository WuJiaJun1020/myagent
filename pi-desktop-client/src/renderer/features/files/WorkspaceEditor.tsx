import { FileCode2, LoaderCircle } from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { CodeEditor } from "./CodeEditor";
import { GitReview } from "./GitReview";

export function WorkspaceEditor() {
  const activeFilePath = useWorkspaceStore((state) => state.activeFilePath);
  const file = useWorkspaceStore((state) => activeFilePath ? state.filesByPath[activeFilePath] : undefined);
  const loadingFilePath = useWorkspaceStore((state) => state.loadingFilePath);
  const fileError = useWorkspaceStore((state) => state.fileError);

  if (activeFilePath && loadingFilePath === activeFilePath && !file) {
    return <div className="workspace-editor-state"><LoaderCircle className="spin" size={17} />正在打开文件…</div>;
  }
  if (activeFilePath && fileError && !file) {
    return <div className="workspace-editor-state error"><FileCode2 size={17} />{fileError}</div>;
  }
  if (file) return <CodeEditor file={file} />;
  return <GitReview />;
}
