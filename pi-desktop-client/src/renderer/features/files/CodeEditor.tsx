import { Check, GitBranch, RotateCcw, Save, Search } from "lucide-react";
import { useRef, useState } from "react";
import type { WorkspaceTextFile } from "../../../shared/contracts/workspace";
import { useWorkspaceStore } from "../../stores/workspace-store";

export function CodeEditor({ file }: { file: WorkspaceTextFile }) {
  const draft = useWorkspaceStore((state) => state.draftsByPath[file.path]);
  const updateDraft = useWorkspaceStore((state) => state.updateDraft);
  const saveFile = useWorkspaceStore((state) => state.saveFile);
  const discardDraft = useWorkspaceStore((state) => state.discardDraft);
  const closeActiveFile = useWorkspaceStore((state) => state.closeActiveFile);
  const [query, setQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const content = draft?.content ?? file.content;
  const dirty = content !== (draft?.originalContent ?? file.content);
  const disabled = file.truncated || draft?.saving === true;

  function findNext(): void {
    const needle = query.trim();
    const textarea = textareaRef.current;
    if (!needle || !textarea) return;
    const start = content.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase(), textarea.selectionEnd);
    const match = start >= 0 ? start : content.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
    if (match < 0) return;
    textarea.focus();
    textarea.setSelectionRange(match, match + needle.length);
  }

  return (
    <section className="code-editor" aria-label={`编辑 ${file.name}`}>
      <header>
        <div><strong>{file.name}</strong><small>{dirty ? "未保存" : "已保存"}</small></div>
        <div className="code-editor-actions">
          <label title="在当前文件中搜索">
            <Search size={13} />
            <input value={query} placeholder="搜索" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && findNext()} />
          </label>
          <button type="button" title="返回 Git 审查" onClick={closeActiveFile}><GitBranch size={13} />Git</button>
          <button type="button" disabled={!dirty || disabled} title="还原为打开文件时的内容" onClick={() => discardDraft(file.path)}><RotateCcw size={13} />还原</button>
          <button type="button" className="primary" disabled={!dirty || disabled} onClick={() => void saveFile(file.path)}><Save size={13} />{draft?.saving ? "保存中" : "保存"}</button>
        </div>
      </header>
      <div className="code-editor-path">{file.path}</div>
      {file.truncated && <div className="viewer-notice">文件过大，当前仅可预览，不能直接编辑。</div>}
      {draft?.conflict && <div className="editor-conflict">{draft.conflict}</div>}
      <textarea
        ref={textareaRef}
        value={content}
        disabled={file.truncated}
        spellCheck={false}
        onChange={(event) => updateDraft(file.path, event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            void saveFile(file.path);
          }
        }}
      />
      <footer><span>{content.split("\n").length} 行</span>{!dirty && <span><Check size={12} />磁盘已同步</span>}</footer>
    </section>
  );
}
