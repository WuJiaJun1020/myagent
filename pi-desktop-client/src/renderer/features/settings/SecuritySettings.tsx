import { ShieldCheck, ShieldOff } from "lucide-react";
import { useEffect } from "react";
import type { ProjectTrustPolicy } from "../../../shared/contracts/pi-settings";
import { useAgentStore } from "../../stores/agent-store";
import { usePiSettingsStore } from "../../stores/pi-settings-store";
import { useResourceStore } from "../../stores/resource-store";
import { useSessionStore } from "../../stores/session-store";
import { SettingsGroup, SettingsRow } from "./SettingsPrimitives";

export function SecuritySettings() {
  const status = useAgentStore((state) => state.processStatus);
  const busy = useAgentStore((state) => state.busy);
  const settings = usePiSettingsStore((state) => state.settings);
  const trust = usePiSettingsStore((state) => state.trust);
  const loading = usePiSettingsStore((state) => state.loading);
  const saving = usePiSettingsStore((state) => state.saving);
  const error = usePiSettingsStore((state) => state.error);
  const initialize = usePiSettingsStore((state) => state.initialize);
  const update = usePiSettingsStore((state) => state.update);
  const setTrust = usePiSettingsStore((state) => state.setTrust);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  async function changeTrust(decision: boolean | null, target: "current" | "parent" = "current"): Promise<void> {
    try {
      await setTrust(decision, target);
    } catch {
      return;
    }
    if (status.cwd) await useResourceStore.getState().initialize(status.cwd);
    if (status.cwd) await useSessionStore.getState().initialize(status.cwd);
  }

  const disabled = loading || saving || busy;

  return (
    <>
      <SettingsGroup title="当前项目" description="可信项目可以加载项目级扩展和其他可执行配置。只信任你了解来源的目录。">
        <div className={`settings-trust-state ${trust?.effectiveTrusted ? "trusted" : "untrusted"}`}>
          {trust?.effectiveTrusted ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}
          <span>
            <strong>{trust?.effectiveTrusted ? "当前项目受信任" : "当前项目未受信任"}</strong>
            <small>{trust?.cwd || status.cwd || "尚未选择工作目录"}</small>
          </span>
        </div>
        <div className="settings-button-row">
          <button className="settings-action-button" type="button" disabled={disabled} onClick={() => void changeTrust(true)}>信任当前目录</button>
          <button className="settings-action-button" type="button" disabled={disabled} onClick={() => void changeTrust(true, "parent")}>信任父目录</button>
          <button className="settings-action-button danger" type="button" disabled={disabled} onClick={() => void changeTrust(false)}>不信任</button>
          <button className="settings-action-button" type="button" disabled={disabled || trust?.savedDecision === null} onClick={() => void changeTrust(null)}>清除记录</button>
        </div>
        {!trust?.requiresTrust && <p className="settings-privacy-note">当前目录没有检测到需要信任才能加载的项目级可执行资源。</p>}
        {trust?.savedPath && <p className="settings-privacy-note">当前决定来自：{trust.savedPath}</p>}
      </SettingsGroup>

      <SettingsGroup title="默认信任策略" description="只在没有保存过项目决定时使用。">
        <SettingsRow title="新项目" description="“询问”最安全；“总是信任”会自动加载未知项目中的可执行资源。">
          <select
            value={settings?.global.defaultProjectTrust ?? trust?.defaultPolicy ?? "ask"}
            disabled={disabled}
            onChange={(event) => void update({ defaultProjectTrust: event.target.value as ProjectTrustPolicy })}
          >
            <option value="ask">每次询问</option>
            <option value="never">默认不信任</option>
            <option value="always">总是信任</option>
          </select>
        </SettingsRow>
      </SettingsGroup>

      {busy && <p className="settings-inline-note">Agent 正在执行，结束任务后才能变更项目信任。</p>}
      {error && <p className="settings-error">{error}</p>}
    </>
  );
}
