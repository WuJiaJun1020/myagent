import { getTerminalTheme } from "../../lib/terminal-theme";
import { HoverHint, HintButton } from "../../components/ui/tooltip";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { ChevronDown, ChevronUp, RotateCw, Search, TerminalSquare, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TerminalDataEvent, TerminalExitEvent, TerminalProfile, TerminalSession } from "../../../shared/contracts/terminal";
import { loadCodeFont, resolveCodeFontFamily } from "../../lib/typography";
import { terminalGateway } from "../../services/terminal-gateway";
import { useAgentStore } from "../../stores/agent-store";
import { useSessionStore } from "../../stores/session-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useUiStore } from "../../stores/ui-store";


export function TerminalPanel() {
  const open = useUiStore((state) => state.terminalPanelOpen);
  const toggleOpen = useUiStore((state) => state.toggleTerminalPanel);
  const sessionMode = useSessionStore((state) => state.session?.mode);
  const status = useAgentStore((state) => state.processStatus);
  const palette = useSettingsStore((state) => state.palette);
  const accent = useSettingsStore((state) => state.accent);
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const codeFontFamily = useSettingsStore((state) => state.codeFontFamily);
  const codeFontSize = useSettingsStore((state) => state.codeFontSize);
  const [activated, setActivated] = useState(false);
  const [profiles, setProfiles] = useState<TerminalProfile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [terminalSession, setTerminalSession] = useState<TerminalSession>();
  const [terminalTitle, setTerminalTitle] = useState("");
  const [error, setError] = useState("");
  const [exited, setExited] = useState(false);
  const [restartVersion, setRestartVersion] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const hostRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<Terminal | undefined>(undefined);
  const fitAddonRef = useRef<FitAddon | undefined>(undefined);
  const searchAddonRef = useRef<SearchAddon | undefined>(undefined);
  const canUseTerminal = sessionMode === "work" && Boolean(status.cwd);

  useEffect(() => {
    if (open) setActivated(true);
  }, [open]);

  useEffect(() => {
    if (!activated) return;
    let cancelled = false;
    void terminalGateway.getProfiles().then((available) => {
      if (cancelled) return;
      setProfiles(available);
      setProfileId((current) => current && available.some((item) => item.id === current) ? current : (available[0]?.id ?? ""));
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => {
      cancelled = true;
    };
  }, [activated]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) terminal.options.theme = getTerminalTheme(palette, resolvedTheme, accent);
  }, [resolvedTheme, palette, accent]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const fontFamily = resolveCodeFontFamily(codeFontFamily);
    terminal.options.fontFamily = fontFamily;
    terminal.options.fontSize = codeFontSize;
    fitAddonRef.current?.fit();
    const id = terminalSession?.id;
    if (id) terminalGateway.resize(id, terminal.cols, terminal.rows);

    let cancelled = false;
    void loadCodeFont(codeFontFamily, codeFontSize).then(() => {
      if (cancelled || terminalRef.current !== terminal) return;
      terminal.refresh(0, Math.max(0, terminal.rows - 1));
      fitAddonRef.current?.fit();
      if (id) terminalGateway.resize(id, terminal.cols, terminal.rows);
    });
    return () => {
      cancelled = true;
    };
  }, [codeFontFamily, codeFontSize, terminalSession?.id]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
      const terminal = terminalRef.current;
      const id = terminalSession?.id;
      if (terminal && id) terminalGateway.resize(id, terminal.cols, terminal.rows);
      terminal?.focus();
    });
  }, [open, terminalSession?.id]);

  useEffect(() => {
    const host = hostRef.current;
    if (!activated || !canUseTerminal || !host || !profileId) return;

    let disposed = false;
    let terminalId: string | undefined;
    let pendingData: TerminalDataEvent[] = [];
    let pendingExit: TerminalExitEvent | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let resizeFrame = 0;
    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: resolveCodeFontFamily(codeFontFamily),
      fontSize: codeFontSize,
      lineHeight: 1.25,
      scrollback: 5_000,
      smoothScrollDuration: 80,
      theme: getTerminalTheme(palette, resolvedTheme, accent),
    });
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(new WebLinksAddon((_event, uri) => void window.piDesktop.openExternal(uri)));
    terminal.open(host);
    fitAddon.fit();
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    setError("");
    setExited(false);
    setTerminalTitle("");

    terminal.attachCustomKeyEventHandler((event) => {
      const key = event.key.toLowerCase();
      if (event.type !== "keydown") return true;
      if (event.ctrlKey && key === "f") {
        setSearchOpen(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
        return false;
      }
      if (event.ctrlKey && key === "c" && terminal.hasSelection()) {
        void navigator.clipboard.writeText(terminal.getSelection());
        return false;
      }
      if (event.ctrlKey && event.shiftKey && key === "c") {
        if (terminal.hasSelection()) void navigator.clipboard.writeText(terminal.getSelection());
        return false;
      }
      return true;
    });

    const dataSubscription = terminalGateway.subscribeData((event) => {
      if (!terminalId) {
        pendingData.push(event);
      } else if (event.id === terminalId) {
        terminal.write(event.data);
      }
    });
    const exitSubscription = terminalGateway.subscribeExit((event) => {
      if (!terminalId) {
        pendingExit = event;
      } else if (event.id === terminalId) {
        terminal.write(`\r\n\x1b[33m[进程已退出，代码 ${event.exitCode}]\x1b[0m\r\n`);
        setExited(true);
        setTerminalSession(undefined);
      }
    });
    const inputSubscription = terminal.onData((data) => {
      if (terminalId) terminalGateway.write(terminalId, data);
    });
    const titleSubscription = terminal.onTitleChange(setTerminalTitle);

    void terminalGateway.create({
      cwd: status.cwd,
      cols: Math.max(2, terminal.cols),
      rows: Math.max(1, terminal.rows),
      profileId,
    }).then((created) => {
      if (disposed) {
        void terminalGateway.kill(created.id);
        return;
      }
      terminalId = created.id;
      setTerminalSession(created);
      for (const event of pendingData) {
        if (event.id === terminalId) terminal.write(event.data);
      }
      pendingData = [];
      if (pendingExit?.id === terminalId) {
        terminal.write(`\r\n\x1b[33m[进程已退出，代码 ${pendingExit.exitCode}]\x1b[0m\r\n`);
        setExited(true);
        setTerminalSession(undefined);
      }
      resizeObserver = new ResizeObserver(() => {
        if (host.clientWidth < 2 || host.clientHeight < 2) return;
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          if (disposed || host.clientWidth < 2 || host.clientHeight < 2) return;
          fitAddon.fit();
          if (terminalId) terminalGateway.resize(terminalId, terminal.cols, terminal.rows);
        });
      });
      resizeObserver.observe(host);
      terminal.focus();
    }).catch((reason: unknown) => {
      if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
    });

    return () => {
      disposed = true;
      dataSubscription();
      exitSubscription();
      inputSubscription.dispose();
      titleSubscription.dispose();
      resizeObserver?.disconnect();
      cancelAnimationFrame(resizeFrame);
      if (terminalId) void terminalGateway.kill(terminalId);
      if (terminalRef.current === terminal) terminalRef.current = undefined;
      if (fitAddonRef.current === fitAddon) fitAddonRef.current = undefined;
      if (searchAddonRef.current === searchAddon) searchAddonRef.current = undefined;
      terminal.dispose();
      setTerminalSession(undefined);
    };
  }, [activated, canUseTerminal, profileId, restartVersion, status.cwd]);

  function clearTerminal(): void {
    terminalRef.current?.clear();
    if (terminalSession?.id) terminalGateway.clear(terminalSession.id);
    terminalRef.current?.focus();
  }

  function restartTerminal(): void {
    setRestartVersion((version) => version + 1);
  }

  function closeSearch(): void {
    searchAddonRef.current?.clearDecorations();
    setSearchOpen(false);
    terminalRef.current?.focus();
  }

  function openSearch(): void {
    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  if (!activated) return null;

  return (
    <section className="terminal-panel" aria-label="本地终端" hidden={!open}>
      <header>
        <div className="terminal-tab">
          <TerminalSquare size={14} />
          <HoverHint content={terminalTitle || status.cwd}><strong >{terminalTitle || terminalSession?.profile.name || "终端"}</strong></HoverHint>
          {terminalSession && <small>PID {terminalSession.pid}</small>}
        </div>
        <div className="terminal-toolbar">
          <select value={profileId} onChange={(event) => setProfileId(event.target.value)} aria-label="终端 Shell">
            {profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}
          </select>
          <HintButton type="button" onClick={openSearch} hint="查找 (Ctrl+F)"><Search size={13} /></HintButton>
          <HintButton type="button" onClick={clearTerminal} hint="清空终端"><Trash2 size={13} /></HintButton>
          <HintButton type="button" onClick={restartTerminal} hint="重启终端"><RotateCw size={13} /></HintButton>
          <button type="button" onClick={toggleOpen} aria-label="收起终端"><ChevronDown size={16} /></button>
        </div>
      </header>
      <div className="terminal-xterm-wrap">
        <div className="terminal-xterm-host" ref={hostRef} />
        {!canUseTerminal && <div className="terminal-overlay">纯聊天会话不启动项目终端</div>}
        {error && <div className="terminal-overlay error">{error}</div>}
        {exited && !error && <button type="button" className="terminal-restart-overlay" onClick={restartTerminal}>终端已退出，点击重新启动</button>}
        {searchOpen && (
          <div className="terminal-search-box">
            <input
              ref={searchInputRef}
              value={searchText}
              aria-label="查找终端输出"
              placeholder="查找"
              onChange={(event) => {
                setSearchText(event.target.value);
                searchAddonRef.current?.findNext(event.target.value, { incremental: true });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  if (event.shiftKey) searchAddonRef.current?.findPrevious(searchText);
                  else searchAddonRef.current?.findNext(searchText);
                } else if (event.key === "Escape") {
                  closeSearch();
                }
              }}
            />
            <HintButton type="button" onClick={() => searchAddonRef.current?.findPrevious(searchText)} hint="上一个"><ChevronUp size={13} /></HintButton>
            <HintButton type="button" onClick={() => searchAddonRef.current?.findNext(searchText)} hint="下一个"><ChevronDown size={13} /></HintButton>
            <HintButton type="button" onClick={closeSearch} hint="关闭查找"><X size={13} /></HintButton>
          </div>
        )}
      </div>
    </section>
  );
}
