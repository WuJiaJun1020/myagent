import { ArrowLeft, ArrowRight, ExternalLink, FolderOpen, Globe, RotateCw, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EMPTY_BROWSER_STATE, type BrowserAction } from "../../../shared/contracts/browser";
import { HintButton } from "../../components/ui/tooltip";
import { useBrowserStore } from "../../stores/browser-store";

export function BrowserPanel() {
  const request = useBrowserStore(state => state.request);
  const close = useBrowserStore(state => state.close);
  const [state, setState] = useState(EMPTY_BROWSER_STATE);
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const surface = useRef<HTMLDivElement>(null);
  const handle = (promise: Promise<unknown>) => { setError(""); void promise.catch(reason => setError(String(reason))); };

  useEffect(() => {
    let live = true;
    const unsubscribe = window.piDesktop.onBrowserState(value => { if (live) setState(value); });
    void window.piDesktop.browserGetState().then(value => { if (live) setState(value); }).catch(reason => { if (live) setError(String(reason)); });
    return () => { live = false; unsubscribe(); };
  }, []);
  useEffect(() => { setAddress(state.url); }, [state.url]);
  useEffect(() => { if (request) { handle(window.piDesktop.browserNavigate(request.url)); useBrowserStore.getState().consumeRequest(); } }, [request]);
  useEffect(() => {
    let last = "";
    let frame = 0;
    let disposed = false;
    const update = () => {
      frame = 0;
      const element = surface.current;
      const rect = element?.getBoundingClientRect();
      const modal = [...document.querySelectorAll('[aria-modal="true"], dialog[open], .modal-backdrop, .settings-page')].some(node => node.getClientRects().length > 0);
      const visible = !document.hidden && !modal && element?.getClientRects().length && !element.closest('[aria-hidden="true"], [data-inactive="true"]');
      const bounds = visible && rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
      const key = JSON.stringify(bounds);
      if (key !== last) { last = key; void window.piDesktop.browserSetBounds(bounds).catch(reason => { if (!disposed) setError(String(reason)); }); }
    };
    // Coalesce changes into one measurement; never poll when the layout is idle.
    const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(schedule);
    for (let node: HTMLElement | null = surface.current; node; node = node.parentElement) resize.observe(node);
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["open", "aria-modal", "aria-hidden", "data-inactive", "hidden", "class", "style"] });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    document.addEventListener("visibilitychange", schedule);
    document.addEventListener("transitionend", schedule, true);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      document.removeEventListener("visibilitychange", schedule);
      document.removeEventListener("transitionend", schedule, true);
      void window.piDesktop.browserSetBounds(null).catch(() => {});
    };
  }, []);

  const action = (value: BrowserAction) => handle(window.piDesktop.browserAction(value));
  return <section className="browser-panel" aria-label="内置浏览器">
    <header className="browser-heading"><Globe size={15} /><span>{state.title}</span><HintButton hint="关闭浏览器" aria-label="关闭浏览器" onClick={close}><X size={15} /></HintButton></header>
    <form className="browser-toolbar" onSubmit={event => { event.preventDefault(); handle(window.piDesktop.browserNavigate(address)); }}>
      <HintButton type="button" hint="后退" aria-label="后退" disabled={!state.canGoBack} onClick={() => action("back")}><ArrowLeft size={15} /></HintButton>
      <HintButton type="button" hint="前进" aria-label="前进" disabled={!state.canGoForward} onClick={() => action("forward")}><ArrowRight size={15} /></HintButton>
      <HintButton type="button" hint={state.loading ? "停止加载" : "刷新"} aria-label={state.loading ? "停止加载" : "刷新"} onClick={() => action(state.loading ? "stop" : "reload")}>{state.loading ? <Square size={13} /> : <RotateCw size={15} />}</HintButton>
      <input aria-label="网页地址" placeholder="网址、localhost 或 HTML 路径" value={address} onChange={event => setAddress(event.target.value)} />
      <HintButton type="button" hint="打开 HTML 文件" aria-label="打开 HTML 文件" onClick={() => action("pick-file")}><FolderOpen size={15} /></HintButton>
      <HintButton type="button" hint="在系统浏览器打开" aria-label="在系统浏览器打开" disabled={!/^https?:/i.test(state.url)} onClick={() => handle(window.piDesktop.openExternal(state.url))}><ExternalLink size={15} /></HintButton>
    </form>
    {(error || state.error) && <div className="browser-error" role="alert">{error || state.error}</div>}
    {!state.url && !state.loading && <div className="browser-empty"><Globe size={24} /><span>输入网址，或打开 HTML 文件</span></div>}
    <div ref={surface} className="browser-surface" />
  </section>;
}
