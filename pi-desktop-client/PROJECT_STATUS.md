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
- 完成 UI 重构第一里程碑：严格 `AgentEvent`、Main Process Event Adapter、AgentGateway 与 Zustand 状态层
- Renderer 已拆分为 Layout、Sidebar、TopBar、Activity Stream、Message、Thinking、Tool、Composer、Detail Panel 和 Extension Dialog
- 新增暗色三栏 Agent Workspace 外观、可折叠侧栏/详情栏、Thinking 展示和 Tool 详情联动
- Queue、Retry、Compaction、并发 Tool Call 和最终消息校正已纳入统一事件流
- 修复关闭窗口时 Pi 事件继续写入已销毁 `webContents` 导致的 `Object has been destroyed` 异常
- 完成 UI 阶段 3：Tailwind CSS、shadcn/ui 基础组件、深浅主题、Framer Motion 和面板尺寸持久化
- 完成 UI 阶段 4：Markdown/GFM、代码复制、Tool Renderer Registry、只读 Terminal 输出和虚拟时间线
- Tool 大输出进入 Renderer 前截断，用户查看历史时不会被流式更新强制拉回底部
- 完成 UI 阶段 5：受控工作区文件 IPC、懒加载文件树、代码查看器、Edit/Write 变更追踪与 Diff 详情联动
- Renderer 只能读取当前工作区内的相对路径；路径穿越、绝对路径和符号链接越界会在 Main Process 被拒绝
- Bash Tool 使用专用只读 Terminal 详情并限制渲染长度，大文件、目录和 Diff 均有安全上限
- 完成 UI 阶段 6：真实 Pi 会话历史、新建/切换、模型选择、Thinking Level 选择和设置页
- 会话切换后通过 Pi `get_messages` 重建消息、Thinking 与 Tool 时间线，不在客户端复制保存聊天历史
- 每个工作区最后使用的会话会持久化，应用或 Pi 重启后自动恢复；模型和 Thinking 状态以 Pi RPC 返回值为准
- Main Process 使用轻量只读 Pi JSONL 会话索引，真实会话路径不暴露给 Renderer，切换仍由 Pi `switch_session` 执行
- 会话现已区分“聊天 / 工作”模式：聊天模式在 Pi 核心中关闭全部 Tool，并使用不加载项目上下文的通用对话提示词；工作模式恢复该会话切换前的工具集合
- 会话模式以 Pi `custom` 元数据写入对应 JSONL，不进入模型上下文；旧会话兼容并默认按工作模式打开
- 会话历史支持当前/历史会话重命名和删除；Renderer 只传会话 ID，Main Process 从受控索引解析路径，删除使用系统回收站
- 删除当前会话前会先建立同模式的替代会话，防止 Pi 继续持有已删除的活动会话文件
- 完成 UI 阶段 7：MCP/Tool Runtime、Memory 上下文浏览、来源作用域、权限风险与错误状态展示
- 本地 Pi 核心增加只读 `get_resources` RPC；桌面端通过 Main/Preload 安全边界读取真实 Tool Registry、Extension 和上下文资源
- MCP 仅在实际 Extension 来源带有 MCP 标识时归类，且“扩展已加载”不会伪装成“远端服务器在线”
- Memory 与聊天数据完全分离，只读展示 Pi 当前加载的指令和 System Prompt 来源；资源正文不写入 Zustand 持久化存储
- Pi 0.85.1 原生不包含 MCP Server 管理或语义/向量 Memory，界面已如实标注能力边界，并为后续 Extension/RAG 接入保留契约
- 模型配置不再只呈现当前 GPT：新增运行时驱动的 Provider 管理页，展示 Pi 当前注册的全部线上模型提供商、认证状态、来源和模型数量
- 支持各 Provider 自带的 API Key 交互、OAuth/订阅登录、浏览器授权、设备码、认证取消和凭据移除
- 凭据仍由 Pi 写入 `auth.json`；Renderer 不读取已保存密钥，也不把密钥写入前端 Store、持久化设置或日志
- Provider 认证完成后自动刷新动态模型目录、会话快照和按 Provider 分组的模型选择器

## 已验证

- `npm.cmd run typecheck` 通过
- `npm.cmd test` 通过（11 个测试文件、32 个测试）
- `npm.cmd run build` 通过
- `npm.cmd run verify:renderer` 通过
- 阶段 6 所需的 `get_state`、`get_messages`、`get_available_models` 和 `get_available_thinking_levels` 已在真实本地 Pi RPC 上验证成功
- 阶段 7 的 `get_resources` 已在真实本地 Pi RPC 上验证成功，返回 8 个内置 Tool、Extension 信息、上下文资源和能力声明
- Pi Coding Agent 的 `rpc-client-get-resources` 回归测试与完整 build 均通过
- Pi monorepo `npm.cmd run check` 通过；Provider RPC 与 Azure OpenAI 图形化认证的定向回归测试各 2 项通过
- Azure OpenAI 的 API Key 配置会同时要求 Base URL 或 Resource Name，避免出现“显示已接入但请求时缺少端点”的状态
- 本次新增 Provider RPC 源码已通过 Pi 全量 `check`，并已重新执行 `npm.cmd run build` 生成运行时 bundle；真实 RPC `get_providers` 冒烟验证成功，当前识别到 42 个 Provider
- 会话模式、历史重命名与删除已通过 Pi 全量 `check`、定向模式/RPC 测试、桌面端 typecheck、32 项测试和生产构建，并已重新生成 Pi runtime bundle
- 无持久化 RPC 冒烟验证通过：工作模式保留 4 个默认活动 Tool，聊天模式将 8 个已注册 Tool 全部停用，切回工作模式后原 4 个 Tool 准确恢复
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

1. 实机检查新工作区布局，并完成一次真实 prompt、Thinking 和 Tool 调用的端到端交互。
2. 如需实际使用 MCP，开发或安装 Pi MCP Extension，并补充服务器探活、凭据配置和最小权限策略；当前阶段完成的是可观测 UI 与接入契约。
3. 如需语义记忆与面试 RAG，新增独立 Memory/RAG 服务并接入现有 Memory 契约；当前只展示 Pi 上下文文件。
4. 增加可交互 PTY Terminal；当前仅展示 Bash Tool 的真实只读输出。
5. 增加正式应用图标、代码签名和发布流程。

## 恢复来源

本状态由本机旧 Codex 会话“构建 pi agent 交互客户端”及当前工作区文件恢复。后续工作以本文件、README 和源码为准，不依赖某个 Codex 登录账号的会话记忆。
