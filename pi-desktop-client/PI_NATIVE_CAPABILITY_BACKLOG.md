# Pi 原生能力接入盘点与后续任务

> 审计日期：2026-09-12
> Pi 基线：`@earendil-works/pi-coding-agent 0.85.1`
> 客户端：`pi-desktop-client` 当前工作区代码
> 与现有文档的关系：`PI_CAPABILITY_ROADMAP.md` 记录阶段 1～5；本文从阶段 6 继续，按当前代码重新盘点，不沿用其中已经过期的“剩余项”。

## 1. 目标

在继续扩展 UI 之前，先把 Pi 原生已有、但桌面客户端尚未完整接入的能力列清楚，并给出可直接执行的实现顺序。

本文只讨论以下三类内容：

1. Pi 原生已经具备，客户端尚未接入；
2. Pi 原生和客户端都已有一部分，但桌面交互不完整；
3. 为把原生能力安全地暴露给 Electron 客户端，必须补充的 Pi RPC。

MCP、语义记忆、语音、Git 写操作等不属于 Pi 原生核心能力，不放进本轮对齐主线。

## 2. 审计依据

本次检查直接对照了代码和文档，而不是只看旧路线图：

- Pi RPC 协议：`../pi-agent/packages/coding-agent/src/modes/rpc/rpc-types.ts`
- Pi RPC 实现：`../pi-agent/packages/coding-agent/src/modes/rpc/rpc-mode.ts`
- Pi 会话、配置、信任和资源实现：`../pi-agent/packages/coding-agent/src/core/`
- Pi 原生说明：`../pi-agent/packages/coding-agent/docs/`
- 客户端 Main/Preload 接口：`src/main/`、`src/preload/index.ts`
- 客户端会话、输入框、设置和资源页：`src/renderer/`
- 客户端共享契约：`src/shared/contracts/`

状态约定：

- ✅ 已接入：主要能力和桌面交互都已具备；
- 🟡 部分接入：核心链路可用，但原生选项、管理入口或反馈缺失；
- ❌ 未接入：Pi 有能力，客户端没有可用入口；
- ➖ 不直接迁移：仅服务 Pi TUI，桌面端应提供等价能力而不是照搬。

## 3. 总体结论

客户端已经接入 Pi 当前稳定 RPC 中的大多数核心执行能力，包括消息流、工具调用、模型与思考等级切换、Provider 登录、队列、压缩、重试、Bash、会话切换以及基础会话树。

当前主要缺口已经从“能不能运行 Agent”转为以下四层：

1. **安全与配置层**：项目可信状态、全局/项目配置、配置来源与生效时机没有客户端接口；
2. **资源生命周期层**：Package、Extension、Skill、Prompt 只能被发现或调用，不能安装、更新、启停、诊断和重载；
3. **高级工作流层**：作用域模型、默认模型、完整压缩/重试参数、分支摘要、会话搜索、文件引用等没有完整接入；
4. **扩展兼容层**：Pi RPC 只桥接了部分 Extension UI，客户端还忽略了 `setTitle`，TUI 自定义组件也没有桌面降级协议。

其中最高优先级是**项目可信状态**。Pi 在 RPC 模式下不会主动弹出信任提示；当 `defaultProjectTrust` 为默认的 `ask` 且没有已保存决定时，项目级 `.pi/settings.json`、Extension、Skill、Prompt、Package 等会被忽略。客户端目前没有解释或修复这个状态的入口，用户会看到“文件明明存在，但 Pi 没加载”的静默失败。

## 4. 当前能力矩阵

### 4.1 核心执行与队列

| Pi 原生能力 | 当前客户端 | 状态 | 后续动作 |
|---|---|---:|---|
| Prompt、流式文本与 Thinking | 已显示并持续更新 | ✅ | 保持事件回归测试 |
| Tool 调用、流式输出、结果 | 已显示，常见 Tool 有专用卡片，未知 Tool 有通用渲染 | ✅ | 后续补扩展自定义渲染降级 |
| Steering / Follow-up | 可排队、逐项展示、互相切换和删除 | ✅ | 保持 Pi 与客户端队列索引一致性测试 |
| Abort Agent | 输入框停止按钮可中止 | ✅ | 保持重试、压缩和队列联动测试 |
| `!` / `!!` Bash | 工作会话可执行，并支持是否写入上下文 | ✅ | 继续与 Pi 原生 Bash RPC 对齐 |
| Bash 中止 | 已接入 | ✅ | 保持 Windows Git Bash/PowerShell 覆盖测试 |
| 自动重试 | 只有启停和中止 | 🟡 | 补次数、延迟、Provider 超时等完整参数 |
| 自动压缩 | 只有启停和手动附加要求 | 🟡 | 补 token 阈值、按模型覆盖和分支摘要配置 |
| 总结重试事件 | Pi 会发 `summarization_retry_*` 事件，客户端未呈现 | 🟡 | 增加明确的“摘要重试中”状态与错误反馈 |

### 4.2 模型与 Provider

| Pi 原生能力 | 当前客户端 | 状态 | 后续动作 |
|---|---|---:|---|
| 可用模型列表和当前模型 | 输入框内选择 | ✅ | 保持模型能力和 Thinking Level 同步 |
| 当前 Thinking Level | 输入框内选择 | ✅ | 保持模型切换后的级别钳制 |
| Provider API Key / OAuth 登录退出 | 设置页已接入 | ✅ | 补凭据来源说明和连接测试 |
| `cycle_model` / `cycle_thinking_level` | RPC 已有，客户端无快捷动作 | ❌ | 接入快捷键和命令面板动作 |
| `enabledModels` / `/scoped-models` | 设置页可勾选模型并立即更新循环作用域 | 🟡 | 补搜索、模式匹配和全量/作用域列表区分 |
| 默认 Provider、模型、Thinking | 可将当前模型保存为全局默认，并设置默认 Thinking | 🟡 | 补项目级默认值与字段来源标识 |
| 每模型默认 Thinking | 可设置当前模型的 `modelThinkingLevels` | ✅ | 保持模型支持等级校验 |
| Thinking token budget | 无管理入口 | ❌ | 接入 `thinkingBudgets`，按模型能力校验 |
| `models.json` 自定义 Provider/模型 | 无 UI 和校验服务 | ❌ | 增加结构化编辑、连接测试和安全存储 |
| 内置 llama.cpp Provider 登录 | Provider 登录链路可发现 | 🟡 | 补连接状态、Router 地址和模型同步 |
| `/llama` 模型加载/卸载/下载 | 命令在 RPC 下只会提示“仅交互模式可用” | ❌ | 为 llama 管理增加独立 RPC 和桌面 UI |
| SSE/WebSocket 传输、超时、代理 | 无 UI | ❌ | 纳入高级网络设置 |

### 4.3 会话与历史

| Pi 原生能力 | 当前客户端 | 状态 | 后续动作 |
|---|---|---:|---|
| 新建、切换、重命名、删除 | 已接入，聊天/工作独立展示 | ✅ | 保持空会话不进入历史的规则 |
| 会话统计 | 会话概览可查看消息、Tool、Token、费用 | ✅ | 可补模型分项，不阻塞主线 |
| Clone / Fork | 已接入 | ✅ | 保持工作目录和会话模式一致 |
| 基础会话树跳转 | 可查看树并跳到节点 | 🟡 | 已支持摘要选择，仍缺标签、筛选、折叠 |
| 分支摘要 | 可选不摘要、默认摘要或自定义摘要要求 | ✅ | 后续补摘要进度与取消反馈 |
| 树节点标签与时间 | Pi 会话格式支持，客户端无入口 | ❌ | 接入设置/清除标签、标签时间和标签筛选 |
| Tree 筛选 | Pi 支持 default/no-tools/user-only/labeled-only/all | ❌ | 在概览树增加筛选并保存默认值 |
| Resume 搜索、排序、仅命名筛选、路径显示 | 左侧只有分组列表 | 🟡 | 增加完整会话浏览页或弹窗 |
| `get_entries` 增量读取 | RPC 已有，客户端未使用 | ❌ | 用于大型会话树/诊断的增量加载 |
| 复制最后一条 Assistant 回复 | RPC 已有 `get_last_assistant_text`，客户端无入口 | ❌ | 增加消息级复制和“复制最后回复”动作 |
| HTML / JSONL 导出、JSONL 导入 | 已接入 | ✅ | 增加最近导出位置和失败原因即可 |
| `/share` 私有 GitHub Gist | 仅 TUI 原生命令，客户端无入口 | ❌ | 增加显式确认、上传进度、结果链接和错误处理 |
| 临时不落盘会话 `--no-session` | 无入口 | ❌ | 增加“临时会话”，并明确关闭后不可恢复 |
| 自定义 `sessionDir` | Main 内部能传目录，设置页不可管理 | 🟡 | 纳入设置并解释聊天/工作目录策略 |

### 4.4 输入与附件

| Pi 原生能力 | 当前客户端 | 状态 | 后续动作 |
|---|---|---:|---|
| 多行输入 | 已支持 | ✅ | 保持 IME 与 Enter/Shift+Enter 测试 |
| 图片附件 | 支持加号选择、剪贴板粘贴和拖放，统一限制 4 张 | ✅ | 后续补会话恢复后的附件状态说明 |
| `@` 文件引用 | 支持工作区模糊搜索、相对路径和键盘补全 | ✅ | 后续可增加引用 Chip |
| 路径 Tab 补全 | 终端有原生补全，聊天输入框没有 | ❌ | 为聊天输入框增加路径补全 |
| 文本文件作为 Prompt 附件 | 当前 DTO 仅允许图片 | ❌ | 增加文本/代码文件附件和大小/编码限制 |
| 图片自动缩放、完全禁图 | Pi 有 `images.autoResize`、`images.blockImages` | ❌ | 纳入设置并在选择附件前反馈 |
| 外部编辑器编辑长 Prompt | Pi TUI 支持 | ➖ | 桌面端应提供大编辑器弹窗，不直接启动终端编辑器 |

### 4.5 配置、信任与安全

| Pi 原生能力 | 当前客户端 | 状态 | 后续动作 |
|---|---|---:|---|
| 全局 `settings.json` | 客户端只改少量会话态参数 | 🟡 | 增加类型化读取、校验和局部更新 RPC |
| 项目 `.pi/settings.json` 覆盖 | 无来源显示和编辑入口 | ❌ | 显示全局值、项目值、最终有效值 |
| 项目信任 `/trust` | 设置页可查看、信任当前/父目录、不信任或清除决定 | ✅ | 补首次进入项目时的主动提醒 |
| `defaultProjectTrust` | 安全设置页可修改全局 ask/always/never | ✅ | 保持风险提示 |
| 项目资源被阻止提示 | 当前会静默缺失 | ❌ | 状态栏与资源页显示被阻止原因和处理按钮 |
| `defaultTools` | 设置页可配置下次启动的内置 Tool，并与当前状态分开显示 | ✅ | 后续增加一键恢复 Pi 默认值 |
| Shell Path / Prefix / npmCommand | 终端会读取 `shellPath`，设置页无入口 | 🟡 | 增加自动探测、手动覆盖、有效性测试 |
| Telemetry / Analytics / 离线模式 | 无 UI | ❌ | 增加隐私设置和启动网络行为说明 |
| 配置更新生效方式 | 无统一约定 | ❌ | 每个字段返回 live/reload/restart/new-session 标记 |

### 4.6 Package、Extension、Skill 与 Prompt

| Pi 原生能力 | 当前客户端 | 状态 | 后续动作 |
|---|---|---:|---|
| Extension Tool/Command 运行 | 已加载的 Tool 和命令可运行 | ✅ | 保持未知 Tool 通用渲染 |
| Skill / Prompt 命令调用 | `get_commands` 可进入斜杠菜单 | 🟡 | 客户端丢失 `sourceInfo`，RPC 未暴露 Prompt `argumentHint` |
| 资源来源与冲突诊断 | Tool、Skill、Prompt 和加载诊断已暴露 | 🟡 | 扩展到 Package、加载顺序和冲突胜出者 |
| `pi install/remove/list/update` | 无客户端入口 | ❌ | 增加安全的 Package 管理服务 |
| npm/git/local Package 来源 | 无 | ❌ | 支持全局/项目作用域和固定版本/Ref |
| Package 资源过滤 | 无 | ❌ | 支持 Extension/Skill/Prompt 细粒度过滤 |
| `pi config` 启停资源 | 无 | ❌ | 增加全局/项目启停与继承状态 |
| `/reload` 资源热重载 | RPC 与设置页已接入，重载后同步命令和资源 | ✅ | 后续返回重载前后差异 |
| Skill 管理 | 只能调用已加载 Skill | 🟡 | 增加列表、来源、启停、打开文件、验证错误 |
| Prompt Template 管理 | 只能调用已加载模板 | 🟡 | 增加参数提示、来源、预览、启停、打开文件 |
| Extension 管理 | 只能查看部分加载状态 | 🟡 | 增加启停、来源、命令/Tool 清单、重载和错误详情 |
| Pi TUI Theme Package | 客户端有独立主题系统 | ➖ | 不直接加载 TUI Theme；如有需要只做 token 导入器 |

### 4.7 Extension UI 兼容

| Pi Extension UI | 当前客户端 | 状态 | 后续动作 |
|---|---|---:|---|
| select / confirm / input / editor | 已桥接为桌面对话框 | ✅ | 增加超时和取消回归测试 |
| notify / setStatus / setWidget | 已桥接 | ✅ | 补来源标识和清理时机 |
| setEditorText | 已写入当前会话独立草稿 | ✅ | 保持跨会话隔离 |
| setTitle | Pi RPC 已发事件，客户端忽略 | ❌ | 更新窗口/任务标题，并在 Extension 卸载后恢复 |
| 自定义 Footer/Header/Component/Overlay | RPC 当前明确不支持 | ❌ | 先做能力协商和降级，不直接传 TUI 组件 |
| 自定义消息、Entry、Tool Renderer | 函数式 TUI Renderer 无法跨进程 | ❌ | 设计可序列化渲染 Schema，未知类型始终保底展示 JSON/文本 |
| Extension 快捷键、自动补全 Provider | 无桌面桥接 | ❌ | 映射为桌面命令注册和 Composer 补全协议 |

## 5. 已确认不属于 Pi 原生缺口

以下能力可以继续作为客户端产品能力开发，但不能以“Pi 原生尚未搬过来”为理由塞进本轮主线：

| 能力 | 结论 |
|---|---|
| 原生 MCP Server 管理 | Pi RPC 明确返回 `nativeMcp: false`；当前 MCP 来自 Extension |
| 语义 Memory / 向量检索 | Pi RPC 明确返回 `semanticMemory: false`；当前 Memory 页展示的是已加载上下文文件 |
| Subagent、Plan、Todo | Pi 核心没有这些内置工作流，可由 Extension 或客户端另行设计 |
| 后台长期 Bash | Pi 原生 Bash 是当前会话内执行，不是后台任务系统 |
| 语音输入 | 客户端未来能力，不是 Pi 原生功能 |
| Git stage/commit/branch | 工作台增强，不是 Pi Agent 核心能力 |
| 多窗口编辑器 | 客户端工作台增强，不是 Pi 原生能力 |
| 聊天/工作双模式 | 当前客户端自己的产品分层，不是 Pi TUI 原生概念 |
| Pi TUI 的布局、鼠标和终端图片协议 | Electron 已有自己的渲染层，不应照搬 TUI 设置 |
| `/quit` | 使用标准窗口关闭即可，无需重新实现命令 |

## 6. 实现原则

后续阶段统一遵循这些约束：

1. **Pi 是配置和资源状态的唯一真源**：不要让 Renderer 直接读写 `~/.pi/agent/*.json`；在 Pi Core/RPC 提供类型化接口。
2. **Renderer 不执行管理命令**：安装 Package、写配置、修改信任都必须通过 Preload 白名单和 Main/Pi RPC，不拼接 Shell 字符串。
3. **每个值都带来源**：设置和资源至少标记 global、project、package、temporary、builtin，并区分配置值与最终有效值。
4. **安全优先于便利**：项目 Package 和 Extension 具有当前用户的完整权限；安装、启用和信任前必须说明来源和风险。
5. **区分生效时机**：修改结果明确标记“立即生效”“需要资源重载”“需要重启 Pi”“只对新会话生效”。
6. **能力协商**：客户端启动时读取 Pi 版本、协议版本和 Feature Flags；旧 Pi 不支持某项时禁用入口并说明原因。
7. **异步操作可观察**：下载、安装、重载、摘要、登录等必须有进度、取消、错误和最终状态。
8. **保底渲染永远存在**：未知 Tool、消息和 Extension 输出不得造成白屏，至少显示安全截断后的文本或 JSON。
9. **敏感字段不回显**：API Key、OAuth Token、带密码的代理 URL 和命令型凭据只能返回“已配置/来源”，不得返回明文。
10. **不混淆 Pi TUI 与桌面端**：TUI 快捷键、Theme 和组件需要桌面等价设计，不直接复制终端实现。

## 7. 后续阶段

## 阶段 6：项目可信状态与类型化设置桥

优先级：P0
目标：解决项目资源静默失效，并建立后续所有管理功能依赖的安全配置通道。

### 问题

RPC 模式没有交互式信任提示。项目存在 `.pi/settings.json`、`.pi/extensions`、`.pi/skills`、`.pi/prompts`、`.pi/themes`、系统 Prompt 或 `.agents/skills` 时，如果没有保存的信任决定，Pi 可能直接忽略它们。

### 任务

- [ ] `P6-01` 在 Pi RPC 增加协议/能力握手，返回 Pi 版本、协议版本和支持的命令/事件 Feature Flags。
- [x] `P6-02` 增加 `get_project_trust`：返回工作目录、是否存在需信任资源、匹配到的信任路径、保存决定、默认策略和本次有效状态。
- [x] `P6-03` 增加 `set_project_trust`：支持信任当前目录、信任父目录、不信任、清除决定；写入仍复用 `ProjectTrustStore`。
- [x] `P6-04` 在设置页增加“安全与信任”，展示项目资源为什么被允许或阻止。
- [ ] `P6-05` 首次进入含受保护资源的工作目录时弹出桌面信任确认；拒绝不应阻止打开普通文件。
- [ ] `P6-06` 修改信任后执行可控的 Pi 重启并恢复当前会话；重启前保存草稿和附件状态。
- [ ] `P6-07` 增加 `get_settings`：同时返回 global、project、effective、字段来源、校验错误和生效策略。
- [ ] `P6-08` 增加 `patch_settings`：只允许白名单字段、局部更新、原子写入和并发冲突检测。
- [ ] `P6-09` 增加配置 Schema 版本和迁移测试；未知字段保留，不整文件覆盖用户手写配置。
- [ ] `P6-10` API Key/OAuth 继续走现有 Provider Auth 服务，不进入通用设置返回值。

### 验收

- [ ] 未信任项目会明确显示“项目资源未加载”，并列出被影响的资源类型。
- [ ] 信任当前目录后重启 Pi，项目 Skill/Prompt/Extension 能被发现；取消信任后再次被阻止。
- [ ] 信任父目录后，子项目能显示继承来源；项目自己的决定能覆盖继承。
- [ ] 修改项目设置不会覆盖全局设置，反之亦然；UI 能显示最终值来自哪里。
- [ ] 恶意或损坏 JSON 只产生可恢复错误，不白屏、不清空原文件。
- [ ] 旧版 Pi 缺少新 RPC 时，客户端显示“不支持”，不发送未知命令。

## 阶段 7：完整设置与资源生命周期管理

优先级：P0/P1
依赖：阶段 6。

### 目标

把 Pi 当前只能通过 `/settings`、`pi config` 和 `pi install` 管理的能力，迁移为可审计的桌面设置与资源中心。

### 任务：设置

- [ ] `P7-01` 模型设置：`defaultProvider`、`defaultModel`、`defaultThinkingLevel`、`modelThinkingLevels`、`thinkingBudgets`。
- [ ] `P7-02` 输出设置：`hideThinkingBlock`、`showCacheMissNotices`、Markdown Mermaid 模式。
- [ ] `P7-03` 压缩设置：`reserveTokens`、`keepRecentTokens`、按模型覆盖、`branchSummary.reserveTokens`、`skipPrompt`。
- [ ] `P7-04` 重试设置：Agent 重试次数/延迟、Provider 超时/重试/最大等待。
- [ ] `P7-05` 消息传输：Steering/Follow-up 默认值、SSE/WebSocket 模式、HTTP/WebSocket 超时。
- [ ] `P7-06` Shell 设置：自动探测结果、`shellPath`、`shellCommandPrefix`、`npmCommand` 和“测试配置”按钮。
- [x] `P7-07` Tool 设置：`defaultTools`，Windows 下明确区分 `bash` 与 `powershell`。
- [ ] `P7-08` Session 设置：`sessionDir`，并说明客户端聊天/工作会话目录的覆盖关系。
- [ ] `P7-09` 图片设置：自动缩放与完全禁止发送图片。
- [ ] `P7-10` 网络与隐私：`httpProxy`、安装遥测、Analytics、离线/跳过版本检查启动策略。

Pi TUI 专用设置，如 `editorPaddingX`、`outputPad`、硬件光标、终端图片协议，不进入桌面设置页。

### 任务：资源中心

- [x] `P7-11` 通过 `get_resources` 与 `get_package_state` 返回 Package、Extension、Skill、Prompt、Theme、Context、Tool 的统一清单。
- [x] `P7-12` 所有可管理资源保留完整 `sourceInfo`：路径、Scope、Package 来源和加载状态。
- [x] `P7-13` 把 Skill/Prompt/Extension 的校验错误和资源冲突诊断暴露给客户端。
- [x] `P7-14` 修复客户端 `SlashCommand` DTO 丢失来源的问题；Pi RPC 增加 Prompt `argumentHint`。
- [ ] `P7-15` 增加 `reload_resources`，返回重载前后差异、诊断和是否需要重启；设置页与资源页共用。
- [x] `P7-16` 增加 Package 列表、安装、移除、更新；支持 npm、git、HTTPS/SSH URL 和本地路径。
- [x] `P7-17` Package 操作支持 global/project Scope、固定 npm 版本、固定 Git Ref 和按资源启停生成的精确过滤。
- [x] `P7-18` 安装前显示来源、目标作用域和“Extension 可执行任意本地代码”警告。
- [ ] `P7-19` 增加下载/安装进度、取消、超时和安全截断日志；项目 Package 必须先通过信任检查。
- [x] `P7-20` 实现 `pi config` 的基础管理 UI：启用/禁用 Extension、Skill、Prompt，并显示来源作用域。
- [ ] `P7-21` Tool 页增加“当前会话启用状态”和“下次启动默认 Tool”两个层级，避免混为一谈。
- [ ] `P7-22` 为资源提供打开所在目录/打开源文件动作，路径必须经过工作区和用户确认校验。
- [x] `P7-23` 增加在线 Package 商店：通过 Main Process 查询 npm `pi-package` 目录，支持搜索、详情、风险与桌面兼容性提示、固定版本安装和外部源码链接。

### 暂不做

- 不允许 Package 管理器更新客户端内置的 Pi Runtime 本体；客户端升级和 Pi 协议升级必须由应用版本统一管理。
- 不直接加载 Pi TUI Theme 到 React 页面。
- 在线 Package 商店只提供发现、审查和调用 Pi 原生安装链路；不在 Renderer 下载或执行第三方代码，也不把目录收录解释为安全审核。

### 验收

- [ ] global 与 project Package 能分别安装、禁用、更新和移除，项目覆盖关系可见。
- [ ] 安装失败不会留下半写配置；重试后状态一致。
- [ ] 重载后新命令立即进入 Composer，新 Tool 进入资源页和 Agent Tool 列表。
- [ ] 同名 Skill/Prompt 冲突时能显示胜出资源与被跳过资源。
- [ ] 修改需要重启的设置时不伪装成已立即生效。

## 阶段 8：模型作用域、自定义 Provider 与本地模型

优先级：P1
依赖：阶段 6；Package/资源能力可与阶段 7 后半部分并行。

### 任务

- [ ] `P8-01` 接入 `cycle_model` 和 `cycle_thinking_level`，加入桌面命令与可配置快捷键。
- [ ] `P8-02` 实现 `enabledModels` 管理：按 Provider/模型搜索、批量启用、模式匹配和 Thinking 预设。
- [ ] `P8-03` 模型选择器区分“全部可用模型”和“当前作用域模型”，并解释循环只经过作用域模型。
- [ ] `P8-04` 在模型菜单增加“设为全局默认”“设为项目默认”“仅当前会话”。
- [ ] `P8-05` 每个模型只展示其 `thinkingLevelMap` 支持的等级；默认 Thinking 与当前 Thinking 分开显示。
- [ ] `P8-06` 为 `models.json` 增加类型化读取、编辑、校验、备份和恢复，不把 API Key 明文送到 Renderer。
- [ ] `P8-07` 自定义 Provider 支持 API 类型、Base URL、模型能力、上下文长度、最大输出、成本和兼容选项。
- [ ] `P8-08` 提供“测试连接”和“刷新模型”动作，错误中区分认证、网络、协议不兼容和模型不存在。
- [ ] `P8-09` 为 llama.cpp 增加独立 RPC：Router 健康状态、已发现模型、加载、卸载、下载、取消、刷新目录。
- [ ] `P8-10` llama 下载展示仓库、量化、大小、进度、受限仓库提示；绝不静默卸载其他模型或删除 GGUF。
- [ ] `P8-11` Provider Auth 页显示凭据来源：Auth 文件、环境变量、OAuth、Provider 自定义配置；只显示状态不回显 Secret。

### 验收

- [ ] 模型循环只经过启用模型，Thinking 循环只经过当前模型支持的等级。
- [ ] “设为默认”重启后仍生效，且项目覆盖全局的来源可见。
- [ ] 添加 Ollama/LM Studio/vLLM 风格的 OpenAI-Compatible Provider 后，无需手改 JSON 即可选择模型。
- [ ] llama Router 断开可重试；下载可取消；加载后模型列表自动刷新。
- [ ] 损坏的 `models.json` 不会被客户端覆盖，并能定位具体字段错误。

## 阶段 9：高级会话、复制分享与文件引用

优先级：P1/P2
依赖：阶段 6。

### 任务：会话

- [ ] `P9-01` 会话概览树增加筛选：default、no-tools、user-only、labeled-only、all。
- [ ] `P9-02` 增加节点折叠、标签设置/清除、标签时间显示和“只看有标签节点”。
- [x] `P9-03` 树跳转前提供：不生成摘要、默认摘要、自定义摘要关注点。
- [ ] `P9-04` 将 `navigate_tree` 的 `customInstructions`、`replaceInstructions`、`label` 完整接入。
- [ ] `P9-05` 大型会话使用 `get_entries` 增量加载，不每次拉取整个树和全部消息。
- [ ] `P9-06` 增加完整会话浏览器：全文搜索、时间/最近使用排序、仅命名、显示路径/工作区。
- [ ] `P9-07` 接入 `get_last_assistant_text`；每条 Assistant 消息也提供复制按钮。
- [ ] `P9-08` 实现 `/share` 等价动作：上传私有 GitHub Gist 前显式确认，完成后复制/打开链接。
- [ ] `P9-09` 增加临时不落盘会话，标题和关闭确认必须持续显示“不会保存”。

### 任务：输入和附件

- [x] `P9-10` Composer 增加 `@` 工作区文件模糊搜索，显示相对路径并避免同名文件歧义。
- [ ] `P9-11` 支持文本/代码文件附件，定义扩展名、最大文件数、单文件/总大小和二进制拒绝规则。
- [x] `P9-12` 图片支持剪贴板粘贴、拖放和文件选择，复用同一校验与临时文件清理逻辑。
- [ ] `P9-13` 增加路径 Tab 补全；补全只读取允许的工作区范围，处理空格、中文和 Windows 路径。
- [ ] `P9-14` 文件附件在用户消息中持久化显示，恢复会话时能说明原文件缺失或已变化。
- [ ] `P9-15` 长 Prompt 提供“展开编辑”桌面弹窗，替代 Pi TUI 的外部编辑器快捷键。

### 验收

- [ ] 跳转分支时三种摘要模式均正确，取消摘要不会产生额外模型调用。
- [ ] 搜索十万行级 JSONL 会话时 UI 不冻结，结果可以定位到对应节点。
- [ ] 复制最后回复只复制 Assistant 正文，不混入 Thinking 或 Tool 输出。
- [ ] 拖入不支持/过大的文件有明确错误，不留下临时文件。
- [ ] 切换会话后，每个会话的文本和附件草稿仍相互独立。

## 阶段 10：Extension RPC 完整度与桌面降级协议

优先级：P2
依赖：阶段 6 的能力握手、阶段 7 的资源来源信息。

### 任务

- [ ] `P10-01` 接入 `setTitle`，保存 Extension 来源；清除 Extension 状态时恢复客户端默认标题。
- [ ] `P10-02` 为所有 Extension UI 请求展示来源、超时、取消原因，防止用户误认为是客户端系统弹窗。
- [ ] `P10-03` 为 Extension UI 增加能力协商；不支持的能力向 Extension 返回明确结果，不静默丢弃。
- [ ] `P10-04` 定义可序列化的桌面 UI Schema，优先覆盖 Progress、Form、Table、Markdown Preview，不传递 TUI Component 函数。
- [ ] `P10-05` 定义自定义消息/Entry/Tool 的安全渲染 Schema；HTML 默认禁止，链接和媒体经过协议白名单。
- [ ] `P10-06` 未识别 Schema 始终回退为来源、类型、文本/JSON，不影响整个会话渲染。
- [ ] `P10-07` 设计 Extension 桌面命令注册，将 TUI Shortcut 映射为可冲突检测的桌面动作。
- [ ] `P10-08` 扩展 Composer 自动补全协议，支持 Prompt 参数提示、Extension 补全结果和异步取消。
- [ ] `P10-09` 增加 Extension 兼容性页：完全兼容、部分降级、仅 TUI 可用、加载失败。

### 验收

- [ ] 现有 select/confirm/input/editor/notify/status/widget 行为不回退。
- [ ] 使用 TUI 自定义组件的 Extension 在桌面端会显示“此界面仅 TUI 支持”或结构化降级，不会无响应。
- [ ] 恶意超长 Widget、自定义 JSON、未知媒体类型不会卡死或白屏。
- [ ] Extension 卸载/重载后，标题、状态、Widget、命令和快捷键全部清理。

## 阶段 11：快捷键、版本信息与对齐收尾

优先级：P2/P3
依赖：阶段 6～10。

### 任务

- [ ] `P11-01` 增加桌面快捷键设置页，覆盖模型循环、Thinking 循环、复制最后回复、新会话、会话浏览、停止、展开 Composer。
- [ ] `P11-02` 快捷键支持冲突检测、恢复默认、平台差异和输入框/终端作用域。
- [ ] `P11-03` 增加 Pi Runtime 版本、客户端版本、协议版本和兼容状态展示。
- [ ] `P11-04` 增加 Pi Changelog 查看入口和“当前客户端支持的 Pi 版本范围”。
- [ ] `P11-05` 把 Pi 自更新与客户端更新分开：应用内置 Runtime 不允许独立 `pi update --self`，防止 RPC 不兼容。
- [ ] `P11-06` 增加能力对齐自动测试，逐项验证 RPC Feature Flag 与客户端入口一致。
- [ ] `P11-07` 更新 README、设置帮助和手工测试清单，删除已经过期的路线图描述。

### 验收

- [ ] 快捷键在 Composer、会话列表、代码编辑器和 xterm 中不会互相劫持。
- [ ] 客户端能明确报告“Pi 太旧”“Pi 太新/协议不兼容”“某功能不支持”。
- [ ] 发布包内的 Pi 版本和客户端声明一致，升级后历史会话与用户配置不丢失。

## 8. 推荐执行顺序

```text
阶段 6：信任 + Settings RPC + 能力握手
  ↓
阶段 7：完整设置 + 资源清单 + Package/Config/Reload
  ├──→ 阶段 8：模型作用域 + 自定义 Provider + llama.cpp
  ├──→ 阶段 9：高级会话 + 文件引用
  └──→ 阶段 10：Extension 桌面协议
              ↓
阶段 11：快捷键 + 版本兼容 + 文档收尾
```

不要先做 Package 商店或复杂自定义组件。没有项目可信状态、配置来源和能力握手时，这些入口容易造成静默失效、执行不受信任代码或客户端/Pi 协议错配。

## 9. 每阶段统一测试要求

### Pi 侧

- [ ] 新 RPC 命令的成功、参数错误、版本不支持和超时测试；
- [ ] Trust、Settings、Package 文件写入的原子性与并发锁测试；
- [ ] Windows 路径、中文路径、空格路径覆盖；
- [ ] `npm run check` 通过；只在对应阶段明确要求时运行构建或完整测试。

### Electron Main / Preload

- [ ] Renderer 只能调用显式白名单；
- [ ] 输入参数在 Main 再校验一次；
- [ ] 不把 Secret、完整环境变量或任意主机文件内容送入 Renderer；
- [ ] Pi 退出、重启、超时、返回未知字段时都有稳定错误；
- [ ] Listener 在会话切换、窗口关闭、Extension 重载后被释放。

### Renderer

- [ ] Loading、Empty、Error、Partial、Unsupported 五种状态都有界面；
- [ ] 切换会话/主题/模型不会让无关组件闪烁；
- [ ] 弹窗和菜单支持键盘、Escape、焦点恢复和屏幕缩放；
- [ ] 大列表虚拟化，流式事件不触发全页重渲染；
- [ ] 浅色/深色主题、100%/125%/150% Windows 缩放人工检查。

### 回归

- [ ] 聊天与工作会话、独立草稿、队列 Steering/Follow-up、图片、Terminal、Tool 审批不回退；
- [ ] 空会话切换、Pi 重启恢复、工作目录变化和历史会话迁移不回退；
- [ ] 打包版本与开发版本使用同一默认字体、缩放、配置和 Pi Runtime。

## 10. 完成定义

“大部分 Pi 原生能力已经进入客户端”至少需要满足：

1. 阶段 6～9 全部完成；
2. Extension 的现有可序列化 UI 全部可用，TUI-only 能力有明确降级；
3. 用户不需要手改 `settings.json`、`trust.json` 或执行 `pi config` 才能完成常见配置；
4. Package/Extension/Skill/Prompt 的来源、作用域、信任和错误均可见；
5. 客户端不会把非 Pi 原生的 MCP、Memory、Git 或语音能力误标为 Pi 对齐缺口；
6. 开发模式与安装包通过统一的手工回归清单。
