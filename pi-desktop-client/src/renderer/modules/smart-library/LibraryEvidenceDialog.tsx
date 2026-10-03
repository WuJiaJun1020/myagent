import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { LibraryEvidence } from "../../../shared/contracts/smart-library";

export function EvidenceDialog({ value, onClose, onJump, label = "回答引用原文", description = "高亮为检索片段，请核对它是否支持回答。" }: {
  value: LibraryEvidence; onClose: () => void; onJump: () => void; label?: string; description?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return createPortal(<dialog className="library-model-dialog library-qa-evidence" ref={ref} onCancel={onClose} aria-label={label}>
    <header><h2>{value.title}</h2><button aria-label="关闭引用" onClick={onClose}><X size={18}/></button></header>
    <div className="library-model-body"><p className="library-qa-evidence-text">{value.text.slice(0, value.highlight.start)}<mark>{value.text.slice(value.highlight.start, value.highlight.end)}</mark>{value.text.slice(value.highlight.end)}</p>{value.locationError && <p role="status">{value.locationError}</p>}</div>
    <footer><span>{description}</span><button disabled={value.page === undefined} onClick={onJump}>阅读原文</button></footer>
  </dialog>, document.body);
}
