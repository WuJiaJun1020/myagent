import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";

export function useInterviewDeleteConfirmation() {
  const [title, setTitle] = useState<string | null>(null);
  const element = useRef<HTMLDialogElement>(null);
  const pending = useRef<((confirmed: boolean) => void) | null>(null);
  function finish(confirmed: boolean) {
    pending.current?.(confirmed);
    pending.current = null;
    element.current?.close();
    setTitle(null);
  }
  useEffect(() => {
    if (title !== null) element.current?.showModal();
  }, [title]);
  useEffect(() => () => { pending.current?.(false); }, []);
  return {
    confirm: (name: string) => new Promise<boolean>(resolve => {
      pending.current?.(false);
      pending.current = resolve;
      setTitle(name);
    }),
    confirmationDialog: title === null ? null : createPortal(
      <dialog ref={element} className="interview-delete-dialog" aria-label="删除面试"
        onCancel={event => { event.preventDefault(); finish(false); }} onClose={() => finish(false)}>
        <header><Trash2 size={19} /><h2>删除面试</h2></header>
        <p>确定永久删除“<strong>{title}</strong>”吗？</p>
        <p className="interview-delete-warning">简历、对话和调试记录会一并删除，无法撤销。</p>
        <footer><button type="button" autoFocus onClick={() => finish(false)}>取消</button>
          <button type="button" className="danger" onClick={() => finish(true)}>删除面试</button></footer>
      </dialog>, document.body),
  };
}
