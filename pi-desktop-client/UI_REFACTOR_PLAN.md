# Pi Desktop UI 重构方案

最后更新：2026-09-11

状态：阶段 0 至阶段 7 已完成
适用范围：`pi-desktop-client` renderer、preload、共享契约及相关 Electron IPC 适配层

## 1. 目标

将当前可运行的 Pi RPC 桌面客户端逐步升级为专业级 AI Agent 工作空间，而不是普通聊天应用。

目标能力包括：

- 用户与 Agent 多轮对话
- Agent 运行状态与模型可公开输出的 thinking 内容展示
- Tool 调用生命周期展示
- Terminal 命令和流式输出展示
- 项目文件浏览与打开
- 文件修改和代码 Diff 展示
- 会话历史、模型、Thinking Level 管理
- 后续扩展 MCP Tool 和 Memory
- 保持 Electron 安全边界以及与真实 Pi Agent RPC 的连接能力

本次重构采用渐进式方案。每个阶段都必须保持应用可运行，不进行一次性推倒重写。

## 2. 当前架构基线

当前数据链路：

```text
Pi Agent 子进程
  ↓ stdout JSONL
Electron Main / PiProcess
  ↓ Electron IPC
Preload / window.piDesktop
  ↓ RpcMessage
App.tsx / handleEvent
  ↓ React useState
Timeline UI
```

当前 renderer 特点：

- `src/renderer/main.tsx` 只负责挂载 React 应用。
- `src/renderer/App.tsx` 同时负责布局、IPC 订阅、事件解析、状态更新、消息发送、Tool 展示和 Extension 弹窗。
- `src/renderer/styles.css` 包含全部全局样式。
- `src/shared/rpc.ts` 中的 `RpcMessage` 仅以 `type: string` 和索引签名表达，领域类型较弱。
- Timeline 目前仅支持 `user`、`assistant`、`tool` 三类视图项。
- Preload 已通过 `contextBridge` 暴露有限 API。
- Electron 已启用 `contextIsolation` 和 sandbox，并禁用 renderer 的 Node 集成。

当前已具备并且重构时必须保留的行为：

- 选择和切换工作区
- 启动、停止和重启 Pi RPC 进程
- 发送 `prompt` 和运行中的 `follow_up`
- 中止当前 Agent 任务
- 流式追加 Assistant 文本
- Tool start、update、end 和错误展示
- `select`、`confirm`、`input`、`editor` Extension UI 请求
- 开发模式和生产模式加载

当前前端实际依赖：

- React
- TypeScript
- Vite
- Lucide React

下列目标依赖尚未接入：

- Tailwind CSS
- shadcn/ui
- Zustand
- Framer Motion

## 3. 当前主要问题

### 3.1 单组件职责过重

`App.tsx` 同时承担传输、领域状态、交互逻辑和视图布局。继续加入文件树、Diff、Terminal 和会话管理后，维护成本会快速增加。

### 3.2 UI 直接依赖 Pi RPC 事件

Renderer 当前直接识别 `agent_start`、`message_update`、`tool_execution_start` 等 Pi 事件。Pi 内部协议变化会直接传播到 React 组件。

### 3.3 类型边界过宽

`RpcMessage` 允许任意字段，UI 依赖多次类型断言。后续事件模型不能使用 `data: any`，必须使用严格判别联合，并将未知数据限制在传输边界。

### 3.4 事件信息损失

当前 `TimelineItem` 会丢失以下信息：

- Session ID、Run ID 和事件顺序
- Assistant 的内容块和 Thinking 内容
- Tool Call 与消息之间的关联
- Token Usage
- 并发 Tool Call
- Queue、Retry 和 Compaction 状态
- 图片、附件和结构化 Tool Result
- 文件修改前后内容

当前只有一个 `activeMessageId`，不适合并发执行、多个 Assistant 内容块或恢复历史会话。

### 3.5 高频更新性能风险

每个流式文本增量都会遍历完整 `items` 数组并触发 Timeline 更新和自动滚动。长会话中可能产生明显的渲染压力。

后续需要：

- 标准化实体存储
- 精确的 Zustand Selector
- 流式增量批处理
- 长列表虚拟化
- Terminal 大输出截断和缓冲

### 3.6 缺少 Agent IDE 视图模型

Tool 参数和结果当前只按 JSON 或纯文本展示。文件修改、命令执行、搜索、读取文件等行为没有独立渲染器，也没有文件树、编辑器、Diff 和 Terminal 数据模型。

### 3.7 Extension UI 支持不完整

当前只处理：

- `select`
- `confirm`
- `input`
- `editor`

Pi RPC 还可能发送：

- `notify`
- `setStatus`
- `setWidget`
- `setTitle`
- `set_editor_text`

### 3.8 设计系统尚未形成

当前样式全部位于一个 CSS 文件中，缺少主题 Token、组件变体、暗色模式、可访问性规范和可调整面板。

## 4. 目标信息架构

推荐采用三块主要工作区域：

```text
┌──────────────────────────────────────────────────────────────┐
│ Top Bar：Workspace / Agent / Model / Thinking / Status      │
├──────────────┬───────────────────────────┬───────────────────┤
│ Sidebar      │ Main Activity Stream      │ Detail Panel      │
│              │                           │                   │
│ Files        │ User Message              │ Code Viewer       │
│ Sessions     │ Assistant Message         │ Diff Viewer       │
│ Search       │ Thinking                  │ Terminal          │
│ MCP          │ Tool Calls                │ Tool Detail       │
│ Memory       │ Agent Status              │                   │
├──────────────┴───────────────────────────┴───────────────────┤
│ Composer：Attachment / Command / Context / Send / Stop      │
└──────────────────────────────────────────────────────────────┘
```

设计原则：

- Chat 和 Agent Timeline 不创建两套重复信息，统一为一个按时间排序的 Activity Stream。
- Tool Card 在时间线中显示摘要，详细输出在右侧 Detail Panel 展示。
- 文件、Diff 和 Terminal 是工作空间能力，不应被当成普通聊天气泡。
- Sidebar 和 Detail Panel 支持折叠及调整宽度。
- 小窗口下允许隐藏 Detail Panel，但不降低 Electron 当前的安全边界。

## 5. 推荐目录结构

```text
src/
├── main/
│   ├── agent/
│   │   ├── pi-process.ts
│   │   └── pi-event-adapter.ts
│   ├── ipc/
│   └── workspace/
│
├── preload/
│   └── index.ts
│
├── shared/
│   ├── contracts/
│   │   ├── agent-events.ts
│   │   ├── agent-commands.ts
│   │   └── desktop-api.ts
│   └── types/
│
└── renderer/
    ├── app/
    │   ├── App.tsx
    │   └── AppProviders.tsx
    ├── pages/
    │   └── WorkspacePage.tsx
    ├── components/
    │   ├── ui/
    │   └── layout/
    │       ├── MainLayout.tsx
    │       ├── TopBar.tsx
    │       ├── Sidebar.tsx
    │       └── DetailPanel.tsx
    ├── features/
    │   ├── chat/
    │   │   ├── ChatPanel.tsx
    │   │   ├── MessageItem.tsx
    │   │   └── Composer.tsx
    │   ├── agent/
    │   │   ├── AgentTimeline.tsx
    │   │   ├── ThinkingBlock.tsx
    │   │   └── AgentStatus.tsx
    │   ├── tools/
    │   │   ├── ToolCallCard.tsx
    │   │   ├── ToolRenderer.tsx
    │   │   └── renderers/
    │   ├── files/
    │   │   ├── FileTree.tsx
    │   │   ├── CodeViewer.tsx
    │   │   └── DiffViewer.tsx
    │   ├── terminal/
    │   │   └── TerminalOutput.tsx
    │   ├── sessions/
    │   └── settings/
    ├── stores/
    │   ├── agent-store.ts
    │   ├── workspace-store.ts
    │   ├── settings-store.ts
    │   └── ui-store.ts
    ├── services/
    │   └── agent-gateway.ts
    ├── hooks/
    │   ├── use-agent-events.ts
    │   └── use-desktop-api.ts
    └── lib/
        ├── event-reducer.ts
        └── utils.ts
```

`components/ui` 用于 shadcn/ui 生成的通用组件；具有业务含义的组件必须放在对应 `features` 中。

## 6. 状态管理方案

### 6.1 agentStore

保存 Agent 运行期状态：

```text
connection
session
activeRun
messagesById
timelineOrder
toolCallsById
thinkingBlocksById
queue
compaction
retry
extensionRequests
```

要求：

- 使用按 ID 标准化的数据结构。
- 所有状态变化通过 `applyAgentEvent(event)` 进入 reducer。
- 不在 React 组件中直接解释 Pi RPC 数据。
- 组件使用精确 Selector，避免无关状态变化触发整个 Timeline 重渲染。

### 6.2 workspaceStore

保存工作区状态：

```text
cwd
fileTree
openFiles
activeFile
diffs
terminalSessions
```

文件读取、写入和目录遍历必须经过 Main Process 的受控 IPC，不能向 renderer 暴露任意 Node.js 文件系统能力。

### 6.3 settingsStore

保存低频、可持久化设置：

```text
theme
preferredModel
thinkingLevel
sidebarWidth
detailPanelWidth
animationEnabled
```

仅持久化设置，不持久化正在生成的流式 Agent 状态。会话消息以 Pi Session 为权威数据源。

### 6.4 uiStore

保存纯界面状态：

```text
activeSidebarTab
activeDetailTab
panelVisibility
modal
commandPalette
```

Composer 文本、临时筛选条件等局部状态可以保留在组件内部，不需要全部写入 Zustand。

## 7. Agent 事件契约

UI 不直接消费 Pi 的原始事件。共享层定义稳定、严格类型的桌面端领域事件。

基础元数据：

```typescript
type AgentEventMeta = {
  eventId: string;
  sequence: number;
  timestamp: number;
  sessionId: string;
  runId?: string;
};
```

建议的第一版事件联合：

```typescript
type AgentEvent =
  | { type: "connection.changed"; meta: AgentEventMeta; state: ConnectionState; detail?: string }
  | { type: "session.changed"; meta: AgentEventMeta; session: AgentSessionSnapshot }
  | { type: "run.started"; meta: AgentEventMeta }
  | { type: "run.settled"; meta: AgentEventMeta; outcome: "completed" | "aborted" | "failed" }
  | { type: "message.started"; meta: AgentEventMeta; messageId: string; role: "user" | "assistant" }
  | {
      type: "message.delta";
      meta: AgentEventMeta;
      messageId: string;
      channel: "text" | "thinking";
      contentIndex: number;
      delta: string;
    }
  | { type: "message.completed"; meta: AgentEventMeta; message: AgentMessage }
  | {
      type: "tool.started";
      meta: AgentEventMeta;
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | { type: "tool.output"; meta: AgentEventMeta; toolCallId: string; output: ToolOutputBlock[] }
  | {
      type: "tool.completed";
      meta: AgentEventMeta;
      toolCallId: string;
      result: ToolResult;
      isError: boolean;
    }
  | { type: "terminal.output"; meta: AgentEventMeta; terminalId: string; delta: string }
  | { type: "file.changed"; meta: AgentEventMeta; change: FileChange }
  | { type: "queue.changed"; meta: AgentEventMeta; steering: string[]; followUp: string[] }
  | { type: "compaction.changed"; meta: AgentEventMeta; state: CompactionState }
  | { type: "retry.changed"; meta: AgentEventMeta; state: RetryState }
  | { type: "interaction.requested"; meta: AgentEventMeta; request: InteractionRequest }
  | { type: "error.raised"; meta: AgentEventMeta; error: AgentError };
```

规则：

- 禁止在领域事件中使用 `any`。
- 未知 Tool 参数可使用 `Record<string, unknown>`。
- `sequence` 在 Main Process 中单调递增，用于排序、去重和重连恢复。
- `eventId` 用于幂等处理。
- `sessionId` 和 `runId` 用于隔离会话和运行批次。
- `messageId`、`toolCallId` 必须显式关联，不能依赖单个全局 `activeMessageId`。
- Thinking 只展示模型和 Pi RPC 实际提供的内容，不推测或生成隐藏推理过程。

### 7.1 Pi RPC 到领域事件的映射

| Pi RPC 事件 | 桌面端事件 |
| --- | --- |
| `agent_start` | `run.started` |
| `agent_settled` | `run.settled` |
| `message_start` | `message.started` |
| `message_update/text_delta` | `message.delta`，channel 为 `text` |
| `message_update/thinking_delta` | `message.delta`，channel 为 `thinking` |
| `message_end` | `message.completed` |
| `tool_execution_start` | `tool.started` |
| `tool_execution_update` | `tool.output` 或专用派生事件 |
| `tool_execution_end` | `tool.completed` |
| `queue_update` | `queue.changed` |
| `compaction_start/end` | `compaction.changed` |
| `auto_retry_start/end` | `retry.changed` |
| `bash_execution_update` | `terminal.output` |
| `extension_ui_request` | `interaction.requested` |

`file.changed` 和部分 `terminal.output` 可以由 Tool 事件派生。若现有 Tool Result 不包含可靠的修改前后内容，则应扩展 Main/Pi Adapter 提供结构化信息，不能在 React 组件中解析不稳定的展示文本。

## 8. Agent 数据流

标准事件方向：

```text
Pi stdout JSONL
  ↓
PiProcess：解析 JSONL、匹配命令响应
  ↓
PiEventAdapter：校验、关联、补充 meta、转换为 AgentEvent
  ↓
Electron IPC：发送严格类型事件
  ↓
useAgentEvents：应用级单次订阅
  ↓
agentStore.applyAgentEvent
  ↓
Zustand Selectors
  ↓
Timeline / Tool / Thinking / Diff / Terminal 组件
```

命令方向：

```text
React UI
  ↓ AgentGateway
Preload API
  ↓ IPC invoke
Electron Main
  ↓ RpcCommand + requestId
Pi Agent stdin
```

`AgentGateway` 建议提供面向产品语义的接口：

```typescript
interface AgentGateway {
  getSnapshot(): Promise<AgentSnapshot>;
  sendPrompt(input: PromptInput): Promise<void>;
  sendFollowUp(input: PromptInput): Promise<void>;
  abort(): Promise<void>;
  selectModel(model: ModelSelection): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): Promise<void>;
  respondToInteraction(response: InteractionResponse): Promise<void>;
  subscribe(listener: (event: AgentEvent) => void): () => void;
}
```

React 业务组件只能调用 `AgentGateway` 或 Store Action，不直接调用 `window.piDesktop.send()`。

### 8.1 初始化和重连

初始化不能只执行一次 `getStatus()`，需要取得一致快照：

1. Renderer 建立事件订阅。
2. 获取包含当前 `sequence` 的 `AgentSnapshot`。
3. Store 应用快照。
4. 丢弃序号不大于快照序号的重复事件。
5. Pi 重启后使用新的 connection generation，清理未完成的临时流式状态。

历史消息从 Pi Session 恢复，Zustand 不作为会话持久化的权威来源。

### 8.2 流式更新

- 文本和 Thinking 增量按 `messageId + contentIndex` 写入对应内容块。
- 高频 delta 可按 animation frame 或短时间窗口批量提交。
- Tool 并发以 `toolCallId` 独立管理。
- `message.completed` 使用 Pi 提供的最终消息覆盖本地临时拼接结果。
- 自动滚动仅在用户接近底部时发生；用户向上查看历史后不得强制拉回底部。

## 9. Tool、文件和 Terminal 设计

### 9.1 Tool Renderer Registry

不要在 `ToolCallCard` 中堆叠大量 `if/else`。使用注册表按 Tool 类型选择渲染器：

```typescript
type ToolRenderer = {
  supports(tool: ToolCallViewModel): boolean;
  renderSummary(tool: ToolCallViewModel): React.ReactNode;
  renderDetail(tool: ToolCallViewModel): React.ReactNode;
};
```

第一批专用渲染器：

- Bash / Terminal
- Read File
- Write File
- Edit File
- Search / Grep
- Generic Tool fallback

### 9.2 文件修改

文件修改视图至少需要：

```text
path
changeType: created | modified | deleted | renamed
beforeContent
afterContent
unifiedDiff
toolCallId
timestamp
```

Diff 数据应由 Main Process 或 Pi 适配层生成。Renderer 只负责展示，不直接读取任意磁盘路径。

### 9.3 Terminal

Terminal 输出需区分：

- command
- cwd
- stdout
- stderr
- exitCode
- running/completed/failed/aborted

第一版可使用只读日志视图；确实需要交互式 PTY 时，再单独设计进程生命周期和权限边界，不与普通 Tool Result 混用。

## 10. UI 技术栈接入原则

### Tailwind CSS

- 使用 CSS Variables 表达背景、前景、边框、强调色和状态色。
- 避免在页面组件中重复长串无语义样式。
- 保留少量全局样式处理窗口、滚动条和字体。

### shadcn/ui

优先采用：

- Button
- Tooltip
- Dropdown Menu
- Dialog
- Select
- Tabs
- Scroll Area
- Resizable Panels
- Command
- Sheet

shadcn/ui 组件源码放入 `renderer/components/ui`，业务逻辑不能写入通用 UI 组件。

### Zustand

- 运行期状态按领域拆分。
- 使用 Selector 订阅最小状态片段。
- Store Action 负责状态变化，组件不直接修改 Map 或实体对象。
- 仅 `settingsStore` 和少量布局设置允许持久化。

### Framer Motion

适用于：

- 面板展开和收起
- Tool Card 状态变化
- Dialog 和浮层进入退出
- 空状态切换

不适用于每个 token 的流式动画，也不应阻塞长列表渲染。

## 11. 分阶段实施计划

### 阶段 0：建立重构基线

任务：

- 记录当前 UI 行为和 RPC 能力。
- 修正共享类型边界。
- 为关键事件 reducer 增加单元测试。
- 保持现有视觉和功能不变。

验收：

- Prompt、Follow Up、Abort、Tool Event、Workspace 和 Extension Dialog 行为不回退。
- Renderer 不再使用宽泛的事件类型断言。

### 阶段 1：事件适配层和 Zustand

任务：

- 新建 `AgentEvent` 和 `AgentCommand` 契约。
- 新建 `PiEventAdapter`。
- 新建 `AgentGateway`。
- 新建 `agentStore`。
- 支持文本、Thinking、Tool、Queue、Retry 和 Compaction 事件。

验收：

- `App.tsx` 不再包含 Pi RPC 事件解析逻辑。
- 多个 Tool Call 可以独立并发更新。
- 最终消息能够校正流式拼接内容。

### 阶段 2：组件拆分

任务：

- 拆分 Layout、Sidebar、TopBar、Timeline、Message、ToolCard、Composer 和 Extension Dialog。
- 保持现有 CSS 和视觉，先完成职责分离。

验收：

- `App.tsx` 只负责应用组合和顶层生命周期。
- 每个业务组件有明确 Props 或 Store Selector。
- 原有功能不回退。

### 阶段 3：设计系统和新布局

任务：

- 接入 Tailwind CSS。
- 初始化 shadcn/ui。
- 建立主题 Token 和暗色模式。
- 实现 Top Bar、可折叠 Sidebar、Main Stream 和 Detail Panel。
- 接入克制的 Framer Motion 动画。

验收：

- 支持窗口缩放和面板尺寸持久化。
- 键盘焦点和交互状态清晰。
- 浅色和暗色主题均可读。

### 阶段 4：专业 Agent Timeline

任务：

- Markdown、代码块和复制操作。
- Thinking Block。
- Tool Renderer Registry。
- Queue、Retry、Compaction 和错误状态。
- 长时间线虚拟化与合理自动滚动。

验收：

- 长对话流式输出没有明显全页抖动。
- Thinking 和正文分离展示。
- Tool 摘要与详细输出分层展示。

### 阶段 5：文件、Diff 和 Terminal

任务：

- 受控文件系统 IPC。
- File Tree 和文件打开。
- Code Viewer 和 Diff Viewer。
- Bash Tool 专用 Terminal Output。
- Timeline 与右侧详情面板联动。

验收：

- 点击文件修改事件可定位到对应 Diff。
- Renderer 无法绕过 Main Process 任意访问文件系统。
- 大输出不会冻结 UI。

### 阶段 6：会话、模型和设置

任务：

- Session History 和切换。
- Model Selector。
- Thinking Level Selector。
- Settings 页面。
- 应用重启后的状态恢复。

验收：

- 会话切换后不混合不同 Session 的事件。
- Pi Session 是历史消息的权威来源。
- 模型和 Thinking Level 与 Pi 实际状态一致。

### 阶段 7：MCP 和 Memory

任务：

- MCP Server、Tool 状态和调用来源展示。
- Memory 浏览、启用范围和来源说明。
- 权限、隐私和错误状态设计。

验收：

- MCP Tool 复用统一 Tool Event 模型。
- Memory 内容与普通聊天消息在视觉和数据层均有明确区别。

## 12. 质量与安全要求

- TypeScript 保持 strict，领域类型禁止 `any`。
- IPC 输入在 Main Process 边界进行运行时校验。
- Renderer 不暴露 Node.js、Shell 或任意文件系统能力。
- Tool 参数和输出按不可信内容处理，不直接注入 HTML。
- Markdown 渲染必须禁用或清洗危险 HTML。
- 大文件、大 Diff 和大 Terminal 输出必须限制尺寸或虚拟化。
- Extension UI 请求支持取消、超时、错误恢复和请求队列。
- 应用退出、Pi 重启和 Workspace 切换时正确清理订阅和未完成请求。
- 保持 Vite 生产构建的相对资源路径，避免 Electron `file://` 再次出现空白页。
- 日常开发优先运行开发模式；只在发布节点生成 EXE。

## 13. 测试策略

### 单元测试

- Pi Event 到 Agent Event 的映射
- Agent Event Reducer
- 流式文本和 Thinking 拼接
- Tool 并发和乱序完成
- Queue、Retry、Compaction 状态
- Session 切换和重连去重

### 组件测试

- Message Item
- Thinking Block
- Tool Call Card
- Composer 快捷键
- Extension Dialog
- Diff 和 Terminal 大内容边界

### 集成测试

- 模拟 Preload API 和完整 RPC 事件序列。
- 从 `agent_start` 到 `agent_settled` 验证完整时间线。
- 验证 Workspace 切换后旧事件不会污染新会话。

### 手工验收

- 真实 Pi Prompt 流式输出。
- Tool 调用、文件修改、Terminal 输出和中止。
- 长对话滚动行为。
- Electron 开发模式和生产构建页面。

不需要每次 UI 修改都打包 EXE。阶段性完成后先运行 TypeScript、相关测试和本地 Electron，发布前再执行完整打包验证。

## 14. 实施约束

- 不在同一个提交中同时替换事件层、状态层和全部视觉组件。
- 每个阶段先保证行为兼容，再进行视觉调整。
- 不让 React 组件依赖 Pi 内部源码类型；仅 Adapter 可以了解 Pi RPC。
- 不通过解析面向人类的 Tool 输出文本建立关键业务状态。
- 不复制保存一套与 Pi Session 冲突的聊天历史。
- 不直接修改 `node_modules` 或构建后的 `dist`。
- 引入依赖时同步更新 `package.json` 和 `package-lock.json`。
- 每个阶段完成后更新本文档的状态和实施记录。

## 15. 推荐的第一个实施里程碑

第一轮只实施“事件契约 + Zustand + 现有界面组件化”，暂不加入文件树和 Diff。

建议新增：

```text
src/shared/contracts/agent-events.ts
src/renderer/services/agent-gateway.ts
src/renderer/stores/agent-store.ts
src/renderer/hooks/use-agent-events.ts
src/renderer/components/layout/MainLayout.tsx
src/renderer/features/chat/ChatPanel.tsx
src/renderer/features/chat/MessageItem.tsx
src/renderer/features/chat/Composer.tsx
src/renderer/features/tools/ToolCallCard.tsx
src/renderer/features/agent/ThinkingBlock.tsx
```

第一里程碑完成标准：

- 当前所有 MVP 功能继续工作。
- `App.tsx` 只负责组合页面。
- UI 不直接解析原始 `RpcMessage`。
- 文本、Thinking 和多个 Tool Call 都能通过统一 Store 更新。
- 尚未安装或实现的 File Tree、Diff、Terminal 交互不使用假数据冒充完成。

## 16. 实施记录

第一实施里程碑已落地以下内容：

- Main Process `PiEventAdapter` 将原始 Pi RPC 事件转换为严格类型的 `AgentEvent`。
- Renderer 通过 `AgentGateway` 和单一应用级订阅消费事件，不再在组件中解析 `RpcMessage`。
- Zustand `agentStore` 使用按 ID 标准化的消息和 Tool 状态，支持 Thinking、并发 Tool、Queue、Retry 与 Compaction。
- `App.tsx` 已精简为页面组合入口，Layout、Sidebar、TopBar、Activity Stream、Message、Thinking、Tool、Composer、Detail Panel 和 Extension Dialog 已拆分。
- 阶段 3 已接入 Tailwind CSS、shadcn/ui 基础组件、深浅主题、Framer Motion，并支持侧栏和详情栏拖动、键盘调整及尺寸持久化。
- 阶段 4 已接入安全 Markdown/GFM、代码块复制、Thinking、Tool Renderer Registry、Bash/Read/Edit/Search 专用展示以及动态高度虚拟时间线。
- Tool 输出在进入 Renderer 前限制为 200,000 字符，自动滚动只在用户停留于底部附近时生效。
- 修复 Electron 窗口关闭期间 Pi 子进程继续发送事件导致 `Object has been destroyed` 的主进程异常，并增加关闭竞态回归测试。
- 阶段 5 已增加受控工作区文件 IPC、懒加载文件树、文本代码查看器、Edit/Write 文件变更跟踪及 Diff 详情联动。
- 文件 IPC 仅接受当前工作区内的相对路径，并校验路径穿越与符号链接逃逸；目录、文件、Diff 和 Terminal 输出均设有大小上限。
- Bash Tool 已使用专用只读 Terminal 视图并限制渲染长度；交互式 PTY Terminal 仍作为后续独立能力，不在本阶段内。
- 阶段 6 已接入真实 Pi Session History、新建与切换，并在切换后从 `get_messages` 全量恢复消息、Thinking 与 Tool 时间线。
- 会话列表使用兼容 Pi JSONL 格式的轻量只读索引；Renderer 只接收会话 ID 和摘要，实际会话路径与 `switch_session` 始终留在 Main Process。
- Top Bar 和设置页已接入 Pi 的真实 Model Selector 与 Thinking Level Selector；候选项和当前值均以 RPC 返回状态为准。
- 主题、动画、面板宽度和每个工作区最后会话通过 Zustand 持久化；应用重启后自动恢复最后会话，再以 Pi Session 覆盖历史视图。
- 会话历史适配器与 JSONL 索引已增加回归测试；主进程未导入完整 Pi 包，生产 bundle 保持轻量。
- 阶段 7 已在本地 Pi RPC 增加只读 `get_resources` 命令，并以统一桌面端契约返回 Tool Registry、Extension、上下文资源、加载错误与能力声明。
- MCP 页面展示真实 Tool 启用状态、来源、作用域及权限风险提示；只将来源明确包含 MCP 标识的 Extension 归类为 MCP，不伪造服务器在线状态。
- Memory 页面与聊天消息使用独立的数据类型和 Store，只读展示 Pi 实际加载的 `AGENTS.md`、`CLAUDE.md`、`SYSTEM.md` 与 `APPEND_SYSTEM.md` 上下文来源及生效范围。
- Pi 0.85.1 没有内置 MCP Server 管理和语义/向量 Memory，因此界面明确标为未内置；后续可通过 Pi Extension 与独立 RAG 服务接入，而无需推翻现有 UI 数据流。
- 资源正文不会进入持久化设置；RPC 与 Main Process 对描述、错误及上下文正文均设置数量和总长度上限。
- 模型提供商配置已改为读取 Pi Runtime 的完整 Provider Registry，不再由桌面端硬编码 GPT 或固定模型清单。
- Pi RPC 已增加 `get_providers`、`login_provider`、`logout_provider` 与可取消的认证交互协议，覆盖 Provider 原生 API Key、OAuth、授权链接和设备码流程。
- 模型提供商页面只显示认证状态、来源和模型数量；API Key/OAuth Token 继续由 Pi `auth.json` 管理，Renderer 不可读取已保存的凭据明文。
- Provider 认证完成后会刷新动态模型目录与桌面端 Session Snapshot，新接入的模型立即进入按 Provider 分组的模型选择器。

| 阶段 | 状态 | 完成日期 | 说明 |
| --- | --- | --- | --- |
| 方案设计 | 已完成 | 2026-09-11 | 当前文档 |
| 阶段 0 | 已完成 | 2026-09-11 | 严格事件契约与 Adapter/Reducer 测试基线 |
| 阶段 1 | 已完成 | 2026-09-11 | Main Process Event Adapter、AgentGateway 与 Zustand |
| 阶段 2 | 已完成 | 2026-09-11 | Layout、Activity、Message、Tool、Composer 和 Dialog 组件拆分 |
| 阶段 3 | 已完成 | 2026-09-11 | Tailwind、shadcn 基础、深浅主题、Framer Motion、可调整面板与持久化 |
| 阶段 4 | 已完成 | 2026-09-11 | Markdown、Thinking、Tool Registry、状态展示、输出限制和虚拟时间线 |
| 阶段 5 | 已完成 | 2026-09-11 | 受控文件 IPC、文件树、代码查看、Diff 联动和只读 Terminal |
| 阶段 6 | 已完成 | 2026-09-11 | Pi 会话历史与切换、模型/Thinking 选择、设置页和重启恢复 |
| 阶段 7 | 已完成 | 2026-09-11 | MCP/Tool 来源与状态、上下文 Memory 浏览、权限/隐私/错误边界 |
