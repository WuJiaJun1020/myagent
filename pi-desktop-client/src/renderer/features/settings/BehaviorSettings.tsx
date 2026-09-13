import type { QueueProcessingMode } from "../../../shared/contracts/agent-session";
import { useEffect, useState } from "react";
import { useAgentStore } from "../../stores/agent-store";
import { usePiSettingsStore } from "../../stores/pi-settings-store";
import { useSessionStore } from "../../stores/session-store";
import { SettingsGroup, SettingsRow, SettingsSwitch } from "./SettingsPrimitives";

export function BehaviorSettings() {
  const session = useSessionStore((state) => state.session);
  const mutation = useSessionStore((state) => state.mutation);
  const error = useSessionStore((state) => state.error);
  const setSteeringMode = useSessionStore((state) => state.setSteeringMode);
  const setFollowUpMode = useSessionStore((state) => state.setFollowUpMode);
  const setAutoCompaction = useSessionStore((state) => state.setAutoCompaction);
  const setAutoRetry = useSessionStore((state) => state.setAutoRetry);
  const busy = useAgentStore((state) => state.busy);
  const hostSettings = usePiSettingsStore((state) => state.settings);
  const settingsLoading = usePiSettingsStore((state) => state.loading);
  const settingsSaving = usePiSettingsStore((state) => state.saving);
  const settingsError = usePiSettingsStore((state) => state.error);
  const initializeSettings = usePiSettingsStore((state) => state.initialize);
  const updateSettings = usePiSettingsStore((state) => state.update);
  const [reserveTokens, setReserveTokens] = useState(16384);
  const [keepRecentTokens, setKeepRecentTokens] = useState(20000);
  const [maxRetries, setMaxRetries] = useState(3);
  const controlsDisabled = busy || Boolean(mutation) || !session;

  useEffect(() => {
    void initializeSettings();
  }, [initializeSettings]);

  useEffect(() => {
    const effective = hostSettings?.effective;
    if (!effective) return;
    setReserveTokens(effective.compaction?.reserveTokens ?? 16384);
    setKeepRecentTokens(effective.compaction?.keepRecentTokens ?? 20000);
    setMaxRetries(effective.retry?.maxRetries ?? 3);
  }, [hostSettings]);

  return (
    <>
      <SettingsGroup title="消息队列" description="这些选项只影响当前 Pi 会话。">
        <SettingsRow title="立即转向队列" description="任务运行中发送的新指令如何进入执行队列。">
          <select value={session?.steeringMode ?? "all"} disabled={controlsDisabled} onChange={(event) => void setSteeringMode(event.target.value as QueueProcessingMode)}>
            <option value="all">全部连续执行</option>
            <option value="one-at-a-time">一次执行一项</option>
          </select>
        </SettingsRow>
        <SettingsRow title="完成后任务队列" description="当前任务完成后，后续消息如何执行。">
          <select value={session?.followUpMode ?? "all"} disabled={controlsDisabled} onChange={(event) => void setFollowUpMode(event.target.value as QueueProcessingMode)}>
            <option value="all">全部连续执行</option>
            <option value="one-at-a-time">一次执行一项</option>
          </select>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="全局默认策略" description="新会话和 Pi 下次启动会使用这些值。当前会话的开关仍可在上方单独调整。">
        <SettingsRow title="默认自动压缩" description="控制新会话是否默认启用上下文压缩。">
          <SettingsSwitch
            checked={hostSettings?.effective.compaction?.enabled ?? true}
            disabled={settingsLoading || settingsSaving}
            label="切换新会话默认自动压缩"
            onChange={(enabled) => void updateSettings({ compaction: { enabled } })}
          />
        </SettingsRow>
        <SettingsRow title="默认自动重试" description="控制新会话是否默认在请求失败后重试。">
          <SettingsSwitch
            checked={hostSettings?.effective.retry?.enabled ?? true}
            disabled={settingsLoading || settingsSaving}
            label="切换新会话默认自动重试"
            onChange={(enabled) => void updateSettings({ retry: { enabled } })}
          />
        </SettingsRow>
        <SettingsRow title="压缩预留 Tokens" description="为系统提示和模型响应保留的上下文空间。">
          <input
            className="settings-number-input"
            type="number"
            min={1024}
            step={1024}
            value={reserveTokens}
            disabled={settingsLoading || settingsSaving}
            onChange={(event) => setReserveTokens(Number(event.target.value))}
            onBlur={() => void updateSettings({ compaction: { reserveTokens, keepRecentTokens } })}
          />
        </SettingsRow>
        <SettingsRow title="压缩后保留 Tokens" description="摘要时优先保留最近对话的目标大小。">
          <input
            className="settings-number-input"
            type="number"
            min={1024}
            step={1024}
            value={keepRecentTokens}
            disabled={settingsLoading || settingsSaving}
            onChange={(event) => setKeepRecentTokens(Number(event.target.value))}
            onBlur={() => void updateSettings({ compaction: { reserveTokens, keepRecentTokens } })}
          />
        </SettingsRow>
        <SettingsRow title="最大自动重试次数" description="请求失败后 Pi 最多重新尝试的次数。">
          <input
            className="settings-number-input"
            type="number"
            min={0}
            max={20}
            value={maxRetries}
            disabled={settingsLoading || settingsSaving}
            onChange={(event) => setMaxRetries(Number(event.target.value))}
            onBlur={() => void updateSettings({ retry: { maxRetries } })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="上下文与恢复">
        <SettingsRow title="自动压缩上下文" description="接近上下文窗口时由 Pi 自动压缩历史。">
          <SettingsSwitch checked={session?.autoCompactionEnabled ?? true} disabled={controlsDisabled} label="切换自动压缩上下文" onChange={(checked) => void setAutoCompaction(checked)} />
        </SettingsRow>
        <SettingsRow title="失败后自动重试" description="按 Pi 的重试策略等待后重新请求，可随时中止。">
          <SettingsSwitch checked={session?.autoRetryEnabled ?? false} disabled={controlsDisabled} label="切换失败后自动重试" onChange={(checked) => void setAutoRetry(checked)} />
        </SettingsRow>
      </SettingsGroup>

      {busy && session && <p className="settings-inline-note">Agent 正在执行，当前会话配置暂不可修改。</p>}
      {error && <p className="settings-error">{error}</p>}
      {settingsError && <p className="settings-error">{settingsError}</p>}
    </>
  );
}
