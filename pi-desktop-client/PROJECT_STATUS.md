# 项目状态

最后更新：2026-09-11

## 当前目标

将 Pi Coding Agent 做成一个可运行的 Electron 桌面客户端。React 负责界面，Electron 主进程通过 stdin/stdout JSONL 与 `pi --mode rpc` 通信。

## 已完成

- Electron + React + TypeScript + Vite 工程骨架
- Electron 主进程启动和重启本地 Pi RPC 进程
- Preload 安全桥与渲染进程 IPC
- 选择本地工作区
- 发送 `prompt` 和运行中的 `follow_up`
- 中止当前运行
- 流式 assistant 消息展示
- 工具开始、增量输出、结束和错误展示
- `select`、`confirm`、`input`、`editor` 扩展交互
- 严格按 LF 解析 JSONL，并覆盖 CRLF、分块和尾包测试
- 本地 Pi CLI 与 Electron 运行时依赖安装
- Electron Builder Windows x64 便携包配置
- 打包后使用 Electron 内置 Node 运行时启动随包 Pi，不依赖系统 Node.js 或全局 Pi
- 可重复的打包运行时与便携外壳自检脚本
- Electron `file://` 生产页面使用相对静态资源路径，并有构建后回归检查
- 修复 0.1.0 生产包因 `/assets/...` 绝对路径导致的空白窗口；修复版版本为 0.1.1

## 已验证

- `npm.cmd run typecheck` 通过
- `npm.cmd test` 通过（3 个测试）
- `npm.cmd run build` 通过
- 本地 Pi CLI 版本：0.85.1
- 真实启动 `pi --mode rpc --no-session`，发送 `get_state` 后收到成功响应
- `npm.cmd run dist:win` 成功生成独立便携 EXE
- `npm.cmd run verify:package` 使用打包后的 `Pi Desktop.exe` 内置运行时启动随包 Pi，`get_state` 成功

Windows GUI 自动化连接在本次验证时不可用，当前非交互式执行环境也无法启动 Electron/NSIS GUI 外壳，所以尚未完成自动截图式界面验收与便携外壳黑盒自检；EXE 生成、包内资源、内置运行时和 Pi RPC 链路均已验证。

## 运行方式

```powershell
npm.cmd run dev
```

也可以运行生产构建：

```powershell
npm.cmd start
```

## 下一阶段待办

1. 实机检查窗口布局，并完成一次真实 prompt 的端到端交互。
2. 增加会话列表及会话切换。
3. 增加模型和 thinking level 选择。
4. 增加文件变更与 Diff 面板。
5. 增加正式应用图标、代码签名和发布流程。

## 恢复来源

本状态由本机旧 Codex 会话“构建 pi agent 交互客户端”及当前工作区文件恢复。后续工作以本文件、README 和源码为准，不依赖某个 Codex 登录账号的会话记忆。
