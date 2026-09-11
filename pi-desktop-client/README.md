# Pi Desktop Client

> [!WARNING]
> 当前 `0.1.1` 仍为开发测试版（Beta），功能、数据格式和 Agent 行为可能继续调整。请勿用于生产环境或未备份的重要项目。

一个基于 Electron、React 和 TypeScript 的最小 Pi RPC 桌面客户端。

## 运行

要求 Node.js 22.19 或更高版本。

```powershell
npm.cmd install
npm.cmd run dev
```

修改本地 Pi 核心后，需要先重新生成它的 RPC bundle：

```powershell
cd ..\pi-agent\packages\coding-agent
npm.cmd run build
cd ..\..\..\pi-desktop-client
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

## 配置模型提供商

启动客户端后，打开“设置 → Agent 模型 → 管理模型提供商”。页面会读取 Pi 当前注册的完整 Provider Registry，而不是维护一份只包含 GPT 的固定列表。

- API Key：点击对应提供商的“配置 API Key”，按 Pi Provider 给出的字段完成配置。
- OAuth/订阅：点击“账号/订阅登录”，客户端会打开授权页面或显示设备验证码。
- 凭据删除：只删除 Pi `auth.json` 中保存的凭据，不会修改系统环境变量或 `models.json`。
- 模型刷新：认证成功后自动刷新该 Provider 的线上模型目录和顶部模型选择器。

密钥由 Pi 写入用户目录下的 `~/.pi/agent/auth.json`。Renderer 只能获得认证状态、来源和模型数量，不能读取已经保存的密钥明文。

## 已实现

- 选择本地工作区并重启 Pi
- 发送 prompt 和 follow_up
- 流式显示 assistant 文本
- 显示工具开始、增量输出、结束与错误状态
- 中止当前 Agent 运行
- 响应 extension 的 select、confirm、input、editor UI 请求
- 严格按 LF 解析 Pi JSONL，不使用 Node readline
- 浏览并配置 Pi 当前注册的全部模型提供商
- 支持 Provider 原生 API Key 表单、OAuth/订阅登录、设备码、注销和模型目录刷新
- 独立的纯聊天与工作模式；聊天模式不加载项目上下文、不向模型暴露本地 Tool，工作模式恢复原工具集合
- 会话历史支持重命名和移入系统回收站，删除当前会话时自动创建同模式的替代会话
- 模型与 Thinking Level 选择、文件树、Diff、Terminal、MCP/Tool Runtime 和上下文 Memory 页面

## 当前边界

运行时使用 Pi 自己的 Provider、凭据、模型目录和会话存储。桌面端不会把 API Key 保存到前端设置或 `localStorage`。

便携 EXE 当前面向 Windows x64。首次运行到新电脑时，需要在该电脑上完成模型配置；用户配置和会话不会硬编码进安装包。
