import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  CircleOff,
  Cloud,
  Copy,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ModelProvider, ProviderAuthProgressEvent } from "../../../shared/contracts/provider-auth";
import { agentGateway } from "../../services/agent-gateway";
import { useAgentStore } from "../../stores/agent-store";
import { useProviderStore } from "../../stores/provider-store";
import { useSessionStore } from "../../stores/session-store";
import { useUiStore } from "../../stores/ui-store";

const sourceLabels: Record<string, string> = {
  stored: "Pi auth.json",
  environment: "环境变量",
  runtime: "临时运行时",
  fallback: "Provider 配置",
  models_json_key: "models.json",
  models_json_command: "models.json 命令",
};

const providerCaveats: Record<string, string> = {
  anthropic: "Claude Pro/Max 的第三方客户端调用可能使用 Extra Usage，并按 Token 额外计费。",
  openrouter: "OpenRouter 账号登录会创建由你控制的 API Key，并从 OpenRouter Credits 计费。",
};

function providerSource(provider: ModelProvider): string {
  if (!provider.configured) return "尚未配置";
  return provider.authSource ? sourceLabels[provider.authSource] ?? provider.authSource : "已配置";
}

function Notice({ notice }: { notice: ProviderAuthProgressEvent["event"] }) {
  if (notice.type === "started" || notice.type === "completed") return null;
  if (notice.type === "device_code") {
    return (
      <div className="provider-auth-notice device-code">
        <span>设备验证码</span>
        <strong>{notice.userCode}</strong>
        <div>
          <button type="button" onClick={() => void navigator.clipboard.writeText(notice.userCode)}><Copy size={13} />复制</button>
          <button type="button" onClick={() => void agentGateway.openExternal(notice.verificationUri)}><ExternalLink size={13} />打开认证页面</button>
        </div>
      </div>
    );
  }
  if (notice.type === "auth_url") {
    return (
      <div className="provider-auth-notice">
        <span>{notice.instructions ?? "请在浏览器中完成账号认证。"}</span>
        <button type="button" onClick={() => void agentGateway.openExternal(notice.url)}><ExternalLink size={13} />打开登录页面</button>
      </div>
    );
  }
  if (notice.type === "info") {
    return (
      <div className="provider-auth-notice">
        <span>{notice.message}</span>
        {notice.links?.map((link) => (
          <button type="button" key={link.url} onClick={() => void agentGateway.openExternal(link.url)}>
            <ExternalLink size={13} />{link.label ?? "查看说明"}
          </button>
        ))}
      </div>
    );
  }
  return <div className={`provider-auth-notice ${notice.type}`}>{notice.type === "progress" ? notice.message : notice.message}</div>;
}

export function ProviderSettingsDialog() {
  const open = useUiStore((state) => state.providerSettingsOpen);
  const setOpen = useUiStore((state) => state.setProviderSettingsOpen);
  const status = useAgentStore((state) => state.processStatus);
  const busy = useAgentStore((state) => state.busy);
  const currentProvider = useSessionStore((state) => state.session?.model?.provider);
  const providers = useProviderStore((state) => state.providers);
  const loading = useProviderStore((state) => state.loading);
  const activeFlow = useProviderStore((state) => state.activeFlow);
  const prompt = useProviderStore((state) => state.prompt);
  const notices = useProviderStore((state) => state.notices);
  const error = useProviderStore((state) => state.error);
  const runtimeError = useProviderStore((state) => state.runtimeError);
  const initialize = useProviderStore((state) => state.initialize);
  const login = useProviderStore((state) => state.login);
  const logout = useProviderStore((state) => state.logout);
  const cancelLogin = useProviderStore((state) => state.cancelLogin);
  const answerPrompt = useProviderStore((state) => state.answerPrompt);
  const clearError = useProviderStore((state) => state.clearError);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    if (open && status.state === "running" && providers.length === 0) void initialize();
  }, [initialize, open, providers.length, status.state]);

  useEffect(() => {
    setAnswer("");
  }, [prompt?.id]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (prompt) void answerPrompt(undefined, true);
      else if (activeFlow) void cancelLogin();
      else setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeFlow, answerPrompt, cancelLogin, open, prompt, setOpen]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return providers
      .filter((provider) => !normalized || `${provider.name} ${provider.id}`.toLocaleLowerCase().includes(normalized))
      .sort((left, right) => Number(right.configured) - Number(left.configured) || left.name.localeCompare(right.name));
  }, [providers, query]);
  const configuredCount = providers.filter((provider) => provider.configured).length;
  const availableModels = providers.reduce((total, provider) => total + provider.availableModelCount, 0);
  const visibleNotices = notices
    .filter((notice) => notice.type !== "started" && notice.type !== "completed")
    .slice(-3);

  const close = () => {
    if (activeFlow) void cancelLogin();
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="settings-backdrop provider-settings-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section
            className="provider-settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="provider-settings-title"
            initial={{ opacity: 0, scale: .985, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: .985, y: 8 }}
          >
            <header className="provider-settings-header">
              <div><span><Cloud size={18} /></span><div><small>PI MODEL RUNTIME</small><h2 id="provider-settings-title">模型提供商</h2><p>配置 Pi 当前注册的所有线上模型服务。</p></div></div>
              <button type="button" aria-label="关闭模型提供商" onClick={close}><X size={17} /></button>
            </header>

            <section className="provider-settings-toolbar">
              <div className="provider-stats">
                <span><strong>{providers.length}</strong><small>提供商</small></span>
                <span><strong>{configuredCount}</strong><small>已配置</small></span>
                <span><strong>{availableModels}</strong><small>可用模型</small></span>
              </div>
              <label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Anthropic、Gemini、DeepSeek…" /></label>
              <button type="button" disabled={loading || Boolean(activeFlow) || status.state !== "running"} onClick={() => void initialize()}>
                {loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}刷新
              </button>
            </section>

            <div className="provider-security-note"><ShieldCheck size={16} /><p>API Key 和 OAuth Token 由 Pi 写入用户目录下的 <code>auth.json</code>。桌面端只读取“是否配置”和来源，不读取、回显或持久化密钥明文。</p></div>
            {error && <div className="provider-error"><CircleOff size={15} /><span>{error}</span><button type="button" onClick={clearError}>关闭</button></div>}
            {!error && runtimeError && <div className="provider-error"><CircleOff size={15} /><span>{runtimeError}</span></div>}
            {activeFlow && visibleNotices.map((notice, index) => <Notice notice={notice} key={`${notice.type}-${index}`} />)}

            <div className="provider-list-scroll">
              {filtered.map((provider) => {
                const active = activeFlow?.providerId === provider.id;
                return (
                  <article className={`provider-card ${provider.configured ? "configured" : ""} ${currentProvider === provider.id ? "current" : ""}`} key={provider.id}>
                    <header>
                      <span className="provider-logo">{provider.name.slice(0, 1).toLocaleUpperCase()}</span>
                      <div><strong>{provider.name}</strong><code>{provider.id}</code></div>
                      <span className={`provider-state ${provider.configured ? "configured" : "missing"}`}>
                        {provider.configured ? <Check size={12} /> : <CircleOff size={12} />}{provider.configured ? "已配置" : "未配置"}
                      </span>
                    </header>
                    <div className="provider-card-facts">
                      <span>认证来源<strong>{providerSource(provider)}</strong></span>
                      <span>可用模型<strong>{provider.availableModelCount}/{provider.modelCount}</strong></span>
                      {currentProvider === provider.id && <span>当前会话<strong>正在使用</strong></span>}
                    </div>
                    {providerCaveats[provider.id] && <p className="provider-caveat">{providerCaveats[provider.id]}</p>}
                    <footer>
                      {provider.authMethods.map((method) => (
                        <button
                          type="button"
                          key={method.type}
                          disabled={!method.interactive || Boolean(activeFlow) || busy}
                          title={method.interactive ? method.name : "此认证方式需要在系统环境中配置"}
                          onClick={() => void login(provider.id, method.type)}
                        >
                          {active && activeFlow?.method === method.type ? <LoaderCircle className="spin" size={13} /> : method.type === "oauth" ? <UserRoundCheck size={13} /> : <KeyRound size={13} />}
                          {method.type === "oauth" ? method.loginLabel ?? (method.isSubscription ? "账号/订阅登录" : "OAuth 登录") : "配置 API Key"}
                        </button>
                      ))}
                      {provider.stored && (
                        <button className="danger" type="button" disabled={Boolean(activeFlow) || busy} onClick={() => void logout(provider.id)}><LogOut size={13} />移除凭据</button>
                      )}
                    </footer>
                  </article>
                );
              })}
              {!loading && filtered.length === 0 && <div className="provider-empty">没有匹配的模型提供商。</div>}
            </div>

            {prompt && (
              <div className="provider-prompt-backdrop">
                <section className="provider-prompt" role="dialog" aria-modal="true" aria-labelledby="provider-prompt-title">
                  <header><div><KeyRound size={16} /><h3 id="provider-prompt-title">{prompt.prompt.message}</h3></div><button type="button" onClick={() => void answerPrompt(undefined, true)}><X size={15} /></button></header>
                  {prompt.prompt.type === "select" ? (
                    <div className="provider-prompt-options">
                      {prompt.prompt.options.map((option) => (
                        <button type="button" key={option.id} onClick={() => void answerPrompt(option.id)}><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</button>
                      ))}
                    </div>
                  ) : (
                    <form onSubmit={(event) => { event.preventDefault(); void answerPrompt(answer); }}>
                      <input
                        autoFocus
                        type={prompt.prompt.type === "secret" ? "password" : "text"}
                        autoComplete={prompt.prompt.type === "secret" ? "off" : "on"}
                        value={answer}
                        placeholder={prompt.prompt.placeholder}
                        onChange={(event) => setAnswer(event.target.value)}
                      />
                      <div><button type="button" onClick={() => void answerPrompt(undefined, true)}>取消</button><button className="primary" type="submit" disabled={!answer.trim()}>提交</button></div>
                    </form>
                  )}
                </section>
              </div>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
