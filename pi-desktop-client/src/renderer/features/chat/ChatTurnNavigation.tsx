import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type NavigationItem = { id: string; index: number; text: string; answer: string };

export function ChatTurnNavigation({ items, activeId, onNavigate }: {
  items: NavigationItem[];
  activeId?: string;
  onNavigate: (index: number) => void;
}) {
  const tooltipId = useId();
  const card = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ id: string; x: number; y: number } | null>(null);
  const item = items.find(candidate => candidate.id === hovered?.id);
  const show = (id: string, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setHovered(previous => previous?.id === id && previous.x === rect.right && previous.y === rect.top ? previous : { id, x: rect.right, y: rect.top });
  };
  useLayoutEffect(() => {
    if (!hovered || !card.current) return;
    const rect = card.current.getBoundingClientRect();
    card.current.style.left = `${Math.max(12, Math.min(hovered.x + 8, window.innerWidth - rect.width - 12))}px`;
    card.current.style.top = `${Math.max(12, Math.min(hovered.y, window.innerHeight - rect.height - 12))}px`;
  }, [hovered, item]);

  return <>
    <nav className="chat-turn-navigation" aria-label="会话轮次导航" onPointerLeave={() => setHovered(null)} onWheel={() => setHovered(null)} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setHovered(null);
    }} onKeyDown={event => { if (event.key === "Escape") setHovered(null); }}>
      {items.map((entry, index) => <button key={entry.id} type="button"
        aria-label={`第 ${index + 1} 轮：${entry.text.slice(0, 60)}`}
        aria-current={activeId === entry.id ? "location" : undefined}
        aria-describedby={item?.id === entry.id ? tooltipId : undefined}
        onPointerEnter={event => show(entry.id, event.currentTarget)}
        onPointerMove={event => show(entry.id, event.currentTarget)}
        onFocus={event => show(entry.id, event.currentTarget)}
        onClick={() => onNavigate(entry.index)}><span /></button>)}
    </nav>
    {item && hovered && createPortal(<div ref={card} id={tooltipId} role="tooltip" className="app-tooltip chat-navigation-tooltip"
      style={{ position: "fixed", left: hovered.x + 8, top: hovered.y, pointerEvents: "none" }}>
      <div className="chat-turn-preview"><strong>{item.text.slice(0, 180) || "图片消息"}</strong>{item.answer && <p>{item.answer.slice(0, 360)}</p>}</div>
    </div>, document.body)}
  </>;
}
