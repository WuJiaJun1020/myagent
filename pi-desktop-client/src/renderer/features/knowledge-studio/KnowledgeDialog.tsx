import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function KnowledgeDialog({ title, children, onClose, actions }: {
  title: string; children: ReactNode; onClose: () => void; actions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
  }, []);
  return createPortal(<dialog ref={ref} className="knowledge-dialog" aria-label={title}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2>{title}</h2><button type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button></header>
    <div className="knowledge-dialog-body">{children}</div>
    <footer>{actions ?? <button type="button" onClick={onClose}>完成</button>}</footer>
  </dialog>, document.body);
}

export function useKnowledgeConfirmation() {
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef<((value: boolean) => void) | null>(null);
  const finish = (value: boolean) => { pending.current?.(value); pending.current = null; setMessage(null); };
  useEffect(() => () => { pending.current?.(false); }, []);
  return {
    confirm: (text: string) => new Promise<boolean>(resolve => { pending.current?.(false); pending.current = resolve; setMessage(text); }),
    confirmation: message === null ? null : <KnowledgeDialog key={message} title="确认删除" onClose={() => finish(false)} actions={<>
      <button type="button" data-initial-focus onClick={() => finish(false)}>取消</button>
      <button type="button" className="danger" onClick={() => finish(true)}>确认删除</button>
    </>}><p className="knowledge-delete-message">{message}</p></KnowledgeDialog>,
  };
}
