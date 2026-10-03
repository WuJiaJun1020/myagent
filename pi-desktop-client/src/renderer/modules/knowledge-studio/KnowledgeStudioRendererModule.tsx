import { DesktopPetControl } from "../../features/desktop-pet/DesktopPetControl";
import { Settings } from "lucide-react";
import { TopBar } from "../../components/layout/TopBar";
import { KnowledgeStudioWorkspace as Workspace } from "../../features/knowledge-studio/KnowledgeStudioWorkspace";
import { useKnowledgeStudioStore } from "../../stores/knowledge-studio-store";
import { useUiStore } from "../../stores/ui-store";

export function KnowledgeStudioSidebar() {
  const tab = useKnowledgeStudioStore((state) => state.tab);
  const snapshot = useKnowledgeStudioStore((state) => state.snapshot);
  const setTab = useKnowledgeStudioStore((state) => state.setTab);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  return <>
    <div className="knowledge-sidebar-summary">
      <strong>知识工坊</strong>
      <button type="button" className={tab === "sources" ? "active" : ""} onClick={() => setTab("sources")}><strong>资料库</strong><span>{snapshot?.sourceCount ?? 0}</span></button>
      <button type="button" className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}><strong>生成任务</strong><span>{snapshot?.batches.length ?? 0}</span></button>

    </div>
    <div className="sidebar-footer"><div className="connection running"><span className="connection-dot" /><span><strong>知识工坊已就绪</strong><small>本地独立数据</small></span></div><div className="sidebar-footer-actions"><DesktopPetControl /><button className="icon-button" type="button" aria-label="打开设置" onClick={() => setSettingsOpen(true)}><Settings size={15} /></button></div></div>
  </>;
}

export function KnowledgeStudioTopBar() {
  return <TopBar heading="知识工坊" section="资料与题目" detailAvailable={false} />;
}

export function KnowledgeStudioWorkspace() {
  return <Workspace />;
}

export function KnowledgeStudioDetailPanel() {
  return null;
}
