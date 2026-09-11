# Pi Desktop Client

一个基于 Electron、React 和 TypeScript 的最小 Pi RPC 桌面客户端。

## 运行

要求 Node.js 22.19 或更高版本。

```powershell
npm.cmd install
npm.cmd run dev
```

## 打包为独立 Windows EXE

```powershell
npm.cmd run dist:win
```

产物位于 `release/Pi-Desktop-0.1.1-x64.exe`。这是便携版单文件 EXE，已包含 Electron 的 Node 运行时和 Pi CLI，目标 Windows x64 电脑不需要另外安装 Node.js 或 Pi。首次使用仍需配置 Pi 支持的模型账号或 API Key。

打包后可验证随包运行时与 Pi RPC：

```powershell
npm.cmd run verify:package
```

在可交互的 Windows 桌面会话中，还可以运行完整便携外壳自检：

```powershell
npm.cmd run verify:portable
```

项目把 `@earendil-works/pi-coding-agent` 安装为本地依赖，Electron 主进程会启动：

```text
pi --mode rpc
```

React 渲染进程通过安全的 Electron IPC 与主进程通信，主进程通过 stdin/stdout JSONL 与 Pi 通信。

## 已实现

- 选择本地工作区并重启 Pi
- 发送 prompt 和 follow_up
- 流式显示 assistant 文本
- 显示工具开始、增量输出、结束与错误状态
- 中止当前 Agent 运行
- 响应 extension 的 select、confirm、input、editor UI 请求
- 严格按 LF 解析 Pi JSONL，不使用 Node readline

## 当前边界

这是桌面 MVP，暂未实现会话列表、模型选择和文件 Diff。运行时使用 Pi 自己的配置与会话存储。

便携 EXE 当前面向 Windows x64。首次运行到新电脑时，需要在该电脑上完成模型配置；用户配置和会话不会硬编码进安装包。
