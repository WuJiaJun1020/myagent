import type { SlashCommand } from "../../../shared/contracts/agent-session";
export type ComposerCommand = Omit<SlashCommand, "source"> & {
    source: SlashCommand["source"] | "desktop";
    usage?: string;
};
export const DESKTOP_COMMANDS: ComposerCommand[] = [
    { name: "settings", description: "打开设置", source: "desktop" },
    { name: "tree", description: "查看会话树并切换分支", source: "desktop" },
    { name: "scoped-models", description: "设置参与轮换的模型", source: "desktop" },
    { name: "export", description: "导出会话（HTML / JSONL）", source: "desktop" },
    { name: "import", description: "导入并恢复 JSONL 会话", source: "desktop" },
    { name: "share", description: "分享会话到 GitHub Gist（需确认）", source: "desktop" },
    { name: "copy", description: "复制最后一条助手回复", source: "desktop" },
    { name: "session", description: "查看会话信息和用量", source: "desktop" },
    { name: "changelog", description: "查看 Pi 更新日志", source: "desktop" },
    { name: "hotkeys", description: "查看桌面端和扩展快捷键", source: "desktop" },
    { name: "fork", description: "从历史消息创建分支", source: "desktop" },
    { name: "clone", description: "复制当前会话", source: "desktop" },
    { name: "trust", description: "管理当前项目信任", source: "desktop" },
    { name: "login", description: "打开模型账号认证", source: "desktop" },
    { name: "logout", description: "管理模型账号并退出登录", source: "desktop" },
    { name: "resume", description: "选择已有会话", source: "desktop" },
    { name: "reload", description: "重新加载扩展、技能和上下文资源", source: "desktop" },
    { name: "quit", description: "关闭客户端", source: "desktop" },
    { name: "new", description: "创建新会话", source: "desktop", usage: "[work|chat]" },
    { name: "chat", description: "新建独立的纯聊天会话", source: "desktop" },
    { name: "work", description: "新建独立的工作会话", source: "desktop" },
    { name: "name", description: "重命名当前会话", source: "desktop", usage: "<名称>" },
    { name: "compact", description: "压缩当前上下文", source: "desktop", usage: "[附加要求]" },
    { name: "thinking", description: "设置 Thinking Level", source: "desktop", usage: "<level>" },
    { name: "model", description: "切换模型", source: "desktop", usage: "<provider/model>" },
    { name: "abort", description: "停止当前任务", source: "desktop" },
];
export function filterCommands(commands: SlashCommand[], query: string | null): ComposerCommand[] {
    if (query === null)
        return [];
    const unique = new Map([...commands, ...DESKTOP_COMMANDS].map(command => [command.name, command]));
    return [...unique.values()].filter(command => command.name.toLowerCase().includes(query.toLowerCase()));
}
