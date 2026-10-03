import { useResourceStore } from "../../stores/resource-store";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { agentGateway } from "../../services/agent-gateway";
import { useSessionStore } from "../../stores/session-store";
import { useAgentStore } from "../../stores/agent-store";
import { MarkdownContent } from "./MarkdownContent";
export type CommandDialogKind = "resume" | "export" | "share" | "hotkeys" | "changelog" | "name" | "quit";
const titles: Record<CommandDialogKind, string> = { resume: "恢复会话", export: "导出会话", share: "分享会话", hotkeys: "快捷键", changelog: "Pi 更新日志", name: "重命名会话", quit: "退出客户端" };
export function SlashCommandDialog({ kind, onClose }: {
    kind: CommandDialogKind;
    onClose: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const session = useSessionStore(s => s.session);
    const [sessionId] = useState(session?.id);
    const sessions = useSessionStore(s => s.sessions);
    const [value, setValue] = useState("");
    const [content, setContent] = useState("");
    const [error, setError] = useState("");
    const [pending, setPending] = useState(false);
    const extensions = useResourceStore(s => s.extensions);
    const busy = useAgentStore(s => s.busy);
    useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => previous?.focus(); }, []);
    useEffect(() => { let alive = true; if (kind === "changelog") {
        setPending(true);
        window.piDesktop.readPiChangelog().then(text => { if (alive)
            setContent(text); }).catch(e => { if (alive)
            setError(String(e)); }).finally(() => { if (alive)
            setPending(false); });
    } return () => { alive = false; }; }, [kind]);
    async function run(action: () => Promise<unknown>, close = true) { if (pending)
        return; setPending(true); setError(""); try {
        if (useSessionStore.getState().session?.id !== sessionId)
            throw Error("当前会话已切换，请关闭后重新执行指令");
        await action();
        if (close)
            onClose();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        setPending(false);
    } }
    const disabled = pending || busy;
    return createPortal(<dialog ref={dialog} aria-labelledby="slash-command-title" className="slash-command-dialog" onCancel={e => { e.preventDefault(); if (!pending)
        onClose(); }}>
 <header><strong id="slash-command-title">{titles[kind]}</strong><button type="button" aria-label="关闭" disabled={pending} onClick={onClose}><X size={17}/></button></header>
 <div className="slash-command-body">
 {kind === "resume" && <><input aria-label="搜索会话" placeholder="搜索会话" value={value} onChange={e => setValue(e.target.value)}/><div className="slash-command-choices">{sessions.filter(s => (s.name || s.firstMessage || s.id).toLowerCase().includes(value.toLowerCase())).map(s => <button key={s.id} disabled={disabled} onClick={() => void run(async () => { await useSessionStore.getState().switchSession(s.id); const error = useSessionStore.getState().error; if (error)
        throw Error(error); })}><strong>{s.name || s.firstMessage || s.id}</strong><small>{s.workspace?.name || "纯聊天"}{s.id === sessionId ? " · 当前" : ""}</small></button>)}</div></>}
 {kind === "name" && <form onSubmit={e => { e.preventDefault(); void run(async () => { if (!value.trim() || !sessionId)
        throw Error("请输入会话名称"); await useSessionStore.getState().renameSession(sessionId, value.trim()); const error = useSessionStore.getState().error; if (error)
        throw Error(error); }); }}><input aria-label="会话名称" placeholder="会话名称" value={value} onChange={e => setValue(e.target.value)}/><button disabled={disabled || !value.trim()}>保存</button></form>}
 {kind === "export" && <div className="slash-command-choices"><button disabled={disabled} onClick={() => void run(() => agentGateway.exportCurrentSessionHtml())}>HTML · 可阅读的会话页面</button><button disabled={disabled} onClick={() => void run(() => agentGateway.exportCurrentSessionJsonl())}>JSONL · 可重新导入的会话</button></div>}
 {kind === "share" && <><p>将当前会话导出为 HTML，上传到 GitHub 的非公开 Gist。内容可能包含代码、文件路径和工具输出；任何持有链接的人都能访问。</p><p>需要本机安装 GitHub CLI 并已登录。</p>{content ? <><input aria-label="分享链接" readOnly value={content}/><button onClick={() => void run(() => navigator.clipboard.writeText(content), false)}>复制链接</button></> : <button disabled={disabled} onClick={() => void run(async () => setContent(await window.piDesktop.shareCurrentSession(sessionId!)), false)}>确认上传并生成链接</button>}</>}
 {kind === "hotkeys" && <><p>Enter：发送消息 · Shift + Enter：换行</p><p>↑ / ↓：选择指令或文件 · Tab：补全 · Enter：执行指令 / 补全文件</p><p>Esc：关闭弹窗 · /：指令 · @：引用文件 · !：运行命令</p><p>Ctrl/Cmd + C / V：复制 / 粘贴 · Ctrl/Cmd + Z：撤销输入</p><p>以下为已加载扩展注册的快捷键，保留按键可能由客户端优先处理：</p>{extensions.flatMap(e => e.shortcuts).map((s, i) => <p key={i}><code>{s.shortcut}</code> · {s.description || "扩展操作"}</p>)}</>}
 {kind === "changelog" && <MarkdownContent content={content}/>}
 {kind === "quit" && <><p>{busy ? "任务仍在执行，退出会中断任务。" : "确认退出客户端？"}</p><button disabled={pending} onClick={() => void run(() => window.piDesktop.closeWindow())}>退出</button></>}
 {pending && <p role="status">正在处理…</p>}{error && <p role="alert" className="danger">{error}</p>}
 </div></dialog>, document.body);
}
