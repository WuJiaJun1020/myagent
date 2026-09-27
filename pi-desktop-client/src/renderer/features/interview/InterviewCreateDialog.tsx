import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function InterviewCreateDialog({ title, children, onClose }: {
  title: string; children: ReactNode; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return createPortal(<dialog ref={dialog} className="interview-create-dialog" aria-label={title}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2>{title}</h2><button type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button></header>
    <div className="interview-create-dialog-body">{children}</div>
    <footer><span>修改保留在本次新建表单中</span><button type="button" onClick={onClose}>完成</button></footer>
  </dialog>, document.body);
}
