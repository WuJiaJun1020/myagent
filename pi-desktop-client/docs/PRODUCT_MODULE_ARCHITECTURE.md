# Pi Desktop 多业务模块架构规划

> 文档版本：1.0  
> 对应客户端基线：0.6.0  
> 最后更新：2026-09-20  
> 状态：平台级架构约束

## 1. 背景

Pi Desktop 当前包含两个不同性质的功能：

- Agent 工作区：围绕 Pi 会话、项目文件、工具和代码任务。
- 智能面试：围绕岗位、简历、面试过程、评分和训练数据。

后续还可能加入：

- 智慧图书阅读助手。
- 个人知识研究系统。
- 学习计划与练习系统。
- 其他拥有独立数据和完整工作流的业务系统。

这些功能不是 Agent 工作区中的一个普通页面，而是共享桌面基础设施的独立产品模块。如果继续把它们都编码为 `sidebarView` 的分支，会产生以下问题：

- 一个页面组件导入所有业务 UI。
- 全局 Store 混合多个业务状态。
- 主进程入口注册所有 IPC 和服务。
- 打开任意模块都启动 Pi Runtime 和其他无关服务。
- 数据目录、设置和生命周期边界不清楚。
- 一个模块的重构容易影响其他模块。

因此，后续采用“一个桌面壳 + 多个编译期业务模块 + 共享基础能力”的模块化单体架构。

## 2. 架构目标

### 2.1 必须实现

- 每个业务模块拥有独立入口、导航、状态、IPC、服务和数据目录。
- 模块之间不能直接读取对方 Store、数据库或内部 Service。
- 模型、Embedding、文档解析、安全存储等基础能力可以共享。
- 共享能力通过稳定接口提供，模块自行负责 Prompt、上下文和业务规则。
- 未进入的模块可以不加载重型 Renderer 代码。
- 未启用的后台服务不应自动运行。
- 新增业务模块时，不需要修改大量已有模块代码。

### 2.2 当前不做

- 不实现运行时下载第三方业务模块。
- 不把业务模块等同于 Pi Extension 或 Package。
- 不为模块建立独立 EXE 或独立安装包。
- 不为了形式上的解耦拆分微服务。
- 不引入复杂依赖注入框架。

首版使用显式 TypeScript 接口和编译期注册表，保持可读、可测试和可调试。

## 3. 三层结构

```text
Desktop Platform
  ├─ App Shell
  ├─ Module Host
  ├─ Shared Capabilities
  │
  ├─ Agent Workspace Module
  ├─ Interview Module
  └─ Reading Assistant Module（未来）
```

### 3.1 Desktop Platform

只负责通用桌面能力：

- Electron 生命周期和窗口。
- 菜单、主题、字体、布局和通知。
- 模块选择和模块生命周期。
- 安全 IPC 基础设施。
- 数据根目录解析。
- 日志、后台任务和错误边界。
- 安全凭据存储。

Platform 不理解“面试题”“图书章节”或“Git Diff”等业务概念。

### 3.2 Shared Capabilities

提供多个模块都可能需要的中立能力：

- `ModelGateway`：模型目录、凭据、请求、流式输出、Token 和错误。
- `EmbeddingGateway`：Embedding 模型与批处理。
- `DocumentParser`：PDF、DOCX、TXT、Markdown 文本提取。
- `RetrievalEngine`：FTS、向量召回、RRF 和引用结构。
- `SecureCredentialStore`：系统安全存储。
- `BackgroundJobManager`：可取消任务、进度、恢复和并发限制。
- `DataDirectoryService`：平台和模块数据目录。
- `ExternalUrlPolicy`：外部链接白名单与协议校验。
- `ExportService`：JSON、Markdown、压缩备份。

共享能力不保存模块工作流状态。例如，模型网关可以知道调用来自 `interview`，但不知道当前面试到第几题。

### 3.3 Product Modules

每个模块拥有完整业务边界：

- Agent Workspace：会话、工具、工作目录、文件、Git 和 Pi 上下文。
- Interview：岗位、候选人、面试、评分、报告和训练。
- Reading Assistant：书籍、章节、批注、阅读进度、问答和知识卡片。

模块可以使用共享能力，不能导入其他模块的内部文件。

## 4. 代码目录目标

采用渐进迁移，不要求一次移动现有全部代码。

```text
src/
  platform/
    shared/                 # 跨进程纯类型、模块 ID、通用错误
    main/                   # ModuleHost、数据目录、后台任务、模型网关
    preload/                # 分命名空间的安全桥
    renderer/               # AppShell、模块切换、全局设置、错误边界

  modules/
    agent/
      shared/
      main/
      renderer/
      tests/

    interview/
      shared/
      main/
      renderer/
      tests/

    reading/
      shared/
      main/
      renderer/
      tests/
```

迁移期间允许保留当前目录：

- `src/main/interview`
- `src/renderer/features/interview`
- `src/main/agent`
- `src/renderer/features/agent`

新架构先通过注册表和接口建立边界；只有修改到相关文件时再迁移路径，避免一次性重构造成大量回归。

## 5. 模块标识与导航

当前 `SidebarView` 同时承担“选择业务模块”和“选择模块内部页面”两种职责，不适合继续扩展。

目标状态拆成两层：

```ts
type ProductModuleId = "agent" | "interview" | "reading";

type ModuleNavigationState = {
  activeModule: ProductModuleId;
  views: {
    agent: AgentView;
    interview: InterviewView;
    reading: ReadingView;
  };
};
```

行为要求：

- 切换模块时保留每个模块上次打开的内部页面。
- 模块内部导航不得修改其他模块状态。
- Agent 的 `activity/files/review/resources` 只属于 AgentView。
- Interview 的 `dashboard/jobs/session/report/knowledge` 只属于 InterviewView。
- Reading 的 `library/reader/notes/search` 只属于 ReadingView。
- 设置页面分为“全局设置”和“模块设置”。

## 6. Renderer 模块宿主

### 6.1 编译期注册表

```ts
type RendererModuleDefinition = {
  id: ProductModuleId;
  title: string;
  load: () => Promise<RendererModule>;
};

type RendererModule = {
  Workspace: React.ComponentType;
  Sidebar: React.ComponentType;
  DetailPanel?: React.ComponentType;
  Settings?: React.ComponentType;
};
```

说明：

- 图标和 React 组件只存在于 Renderer 注册表，不进入 shared contract。
- 模块使用动态 `import()` 懒加载。
- AppShell 只渲染当前模块提供的插槽。
- 每个模块设置自己的 Error Boundary，局部错误不替换整个客户端。

### 6.2 页面骨架

```text
AppShell
  ├─ AppChrome
  ├─ ModuleSwitcher
  ├─ ActiveModule.Sidebar
  ├─ ActiveModule.Workspace
  ├─ ActiveModule.DetailPanel
  └─ GlobalSettings / ModuleSettings
```

当前 `WorkspacePage` 中针对 interview、review、files、mcp 的长条件表达式，应逐步替换为模块插槽。

## 7. Main Process 模块宿主

### 7.1 模块生命周期

```ts
type MainModuleContext = {
  dataDirectory: string;
  modelGateway: ModelGateway;
  embeddingGateway: EmbeddingGateway;
  backgroundJobs: BackgroundJobManager;
  externalUrls: ExternalUrlPolicy;
};

interface MainProductModule {
  readonly id: ProductModuleId;
  start(context: MainModuleContext): Promise<void> | void;
  registerIpc(): () => void;
  suspend?(): Promise<void> | void;
  resume?(): Promise<void> | void;
  dispose(): Promise<void> | void;
}
```

生命周期原则：

- Platform 启动不等于所有模块立即启动。
- 轻量模块可以首次进入时初始化。
- 数据库连接按需打开，应用退出时关闭。
- 采集、索引和模型任务由后台任务管理器登记。
- 应用退出时统一取消或安全落盘。
- 模块注册 IPC 时返回注销函数，避免测试和热重载重复注册。

### 7.2 主进程入口

`src/main/index.ts` 最终只负责：

- Electron 启动。
- 创建 Platform 服务。
- 注册模块。
- 创建窗口。
- 统一退出清理。

具体面试、阅读或 Agent IPC 必须移入对应模块注册函数。

## 8. Preload 与 IPC 边界

当前单一 `window.piDesktop` 可以暂时保留，但 API 要按命名空间组织：

```ts
window.desktop.platform
window.desktop.agent
window.desktop.interview
window.desktop.reading
```

IPC 命名保持：

```text
platform:*
agent:*
interview:*
reading:*
```

规则：

- Renderer 组件不能直接使用 `ipcRenderer`。
- 模块 Renderer 只能访问本模块 API 和公开 Platform API。
- 模块 API 输入在主进程重新校验。
- 跨模块调用不能通过猜测 IPC 名称完成。
- 事件监听必须返回取消订阅函数。

暂不要求立刻把所有旧 `pi:*` IPC 改名；新接口必须遵守新命名空间，旧接口按修改范围渐进迁移。

## 9. 数据目录与数据库边界

目标目录：

```text
userData/
  platform/
    settings/
    credentials/
    logs/
    jobs/

  modules/
    agent/
    interview/
      interview.db
      files/
      vectors/
      exports/
    reading/
      reading.db
      books/
      vectors/
      exports/
```

规则：

- 每个模块拥有独立 SQLite 数据库和 Schema 版本。
- 一个模块不能直接查询另一个模块的数据库。
- LanceDB 物理目录或表名必须带模块命名空间。
- 原始文件保存在所属模块目录，不放入 Git 工作区。
- Platform 数据库只保存模块目录、任务和全局设置，不保存业务内容。

当前面试数据位于旧路径 `userData/interview`。迁移到新目录时必须：

1. 在任何面试数据库连接打开前执行。
2. 识别旧目录和新目录。
3. 关闭或检查 WAL 状态。
4. 进行可回滚移动并保留失败后备路径。
5. 使用真实旧目录副本进行自动化迁移测试。
6. 不以删除旧数据作为修复方式。

在平台骨架完成前，可以继续使用旧路径，不能边开发边无提示改变用户数据位置。

## 10. 跨模块共享数据

默认原则是“不共享”。只有出现明确用户价值时，才通过公开服务共享。

例如阅读助手中的一本技术书可能成为面试知识来源，正确方式是：

```text
Reading Module
  -> 用户选择“发布到共享知识库”
  -> Shared Knowledge Catalog 保存只读发布版本
  -> Interview Module 按授权引用
```

错误方式：

- Interview 直接读取 `reading.db`。
- 两个模块共用一个没有 owner/scope 字段的文档表。
- 通过 Renderer Store 传递大量业务对象。
- 自动把私人书籍、批注或简历暴露给其他模块。

共享对象必须拥有：

- 稳定 ID。
- `ownerModule`。
- 授权范围。
- 版本和内容哈希。
- 删除或撤回行为。
- 来源与隐私等级。

## 11. AI 与 RAG 公共能力

面试和阅读都会使用模型、Embedding 和检索，但业务目标不同。

### 11.1 共享部分

- Provider 凭据和模型目录。
- 请求重试、超时、限流和取消。
- Token 与成本统计。
- Embedding 批处理和模型版本。
- 文档解析器。
- FTS、向量召回和 RRF 实现。
- 通用引用数据结构。
- 索引任务基础设施。

### 11.2 模块自有部分

- Prompt 和输出 Schema。
- 上下文选择策略。
- Chunk 业务元数据。
- 检索过滤条件。
- 重排规则。
- 数据保留与删除规则。
- 业务评估指标。

示例：

- 面试 RAG 优先岗位、技能、题目和评分量表。
- 阅读 RAG 优先当前书籍、章节范围、批注和引用页码。

不能为了复用而把两者做成同一个“万能聊天上下文”。

## 12. 后台任务平台

采集、文档解析、Embedding、报告生成都属于长任务，应使用统一任务模型：

```ts
type BackgroundJob = {
  id: string;
  moduleId: ProductModuleId;
  type: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress?: number;
  message?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
};
```

要求：

- 同类任务并发限制。
- 支持取消或安全停止。
- 模块切换不取消后台任务。
- 应用退出时明确处理未完成任务。
- 事件包含 `moduleId`，只由对应模块消费。
- 错误摘要不包含 API Key 或完整私人文档。

## 13. 设置架构

设置分为两层：

### 全局设置

- 外观、字体和语言。
- Provider 与模型凭据。
- 默认模型与 Embedding 模型。
- 网络、代理、日志和更新。
- 数据根目录、备份和全局隐私。

### 模块设置

- Agent：审批、默认工作目录、Pi Runtime。
- Interview：默认题数、评分维度、岗位来源、面试模型。
- Reading：默认解析策略、阅读模型、引用样式。

全局设置页面通过模块注册表挂载模块设置区，不在公共组件中硬编码全部业务字段。

## 14. 新增业务模块的标准步骤

以后新增智慧图书阅读助手时，必须按以下顺序：

1. 分配稳定 `ProductModuleId`。
2. 定义模块 shared contracts，不能导入其他业务模块类型。
3. 注册独立 Main Module 和 IPC。
4. 分配独立数据目录和数据库迁移版本。
5. 注册 Renderer Module、导航和设置。
6. 只通过 Shared Capabilities 使用模型、Embedding 和文档解析。
7. 增加模块启动、关闭、数据库迁移和错误隔离测试。
8. 验证进入该模块不会创建 Pi 会话或修改其他模块数据。
9. 更新模块清单和架构决策记录。

## 15. 平台化实施顺序

平台化只做当前可验证的最小骨架，不延迟面试核心流程过久。

### PLAT-101：拆分模块和页面导航

状态：已完成（2026-09-20）。

- 增加 `ProductModuleId`。
- 将 `activeModule` 从 `SidebarView` 分离。
- 为每个模块保存独立内部导航。
- 保持现有 UI 视觉不变。

验收：Agent 和 Interview 来回切换时各自页面状态不串联。

### PLAT-102：Renderer ModuleHost

状态：已完成（2026-09-20）。

- 将 Agent 和 Interview 页面包装为两个 Renderer Module。
- AppShell 通过注册表渲染 Sidebar、Workspace 和 DetailPanel。
- Interview 模块使用懒加载。
- 增加模块级 Error Boundary。

验收：`WorkspacePage` 不再直接导入 Interview 业务组件。

### PLAT-103：Main ModuleHost 与 IPC 注册拆分

状态：已完成（2026-09-20）。

- 把 Interview Service 初始化和 IPC 移出 `src/main/index.ts`。
- 模块提供 `registerIpc` 和 `dispose`。
- 模块启动与释放有超时边界，单个模块挂起不能阻止主窗口出现或客户端退出。
- 长任务在模块释放时先取消并等待收尾，再关闭数据库和向量连接。
- 保持数据库路径和 API 行为兼容。

验收：主进程入口不包含面试业务用例，退出时模块资源正常释放。

### PLAT-104：共享模型端口

状态：已完成基础端口（2026-09-20）。真实 Provider 适配在具体业务接入时实现。

- 建立中立 `ModelGateway`、`EmbeddingGateway` 接口。
- Provider 凭据和模型目录属于 Platform。
- 请求必须带 `moduleId`、`purpose`、预算和隐私级别。
- 路由标识使用规范化小写 ID；可预期错误统一使用 Result/失败事件，不以异常混合表达。
- 不接入 Pi Session。

验收：Interview 测试替身和未来 Reading Module 可以使用同一端口，不共享上下文。

### PLAT-105：数据目录服务与模块模板

状态：待实施；现有 Interview 数据路径保持不变。

- 建立 `DataDirectoryService`。
- 暂时兼容现有 Interview 旧路径。
- 为新模块提供最小目录、IPC、Store 和测试模板。
- 文档化新增模块步骤。

验收：可以创建一个无业务逻辑的示例模块而无需修改 Agent 内部代码。

完成 PLAT-101 至 PLAT-104 后，继续智能面试 `INT-101`。PLAT-105 可以和面试阶段 1 后半并行完成。

## 16. 依赖方向

允许：

```text
modules/* -> platform contracts
modules/* -> shared capabilities interfaces
platform renderer -> module public definitions
platform main -> module lifecycle definitions
```

禁止：

```text
modules/interview -> modules/agent/internal
modules/reading -> modules/interview/internal
platform -> 某个模块的业务实体
renderer -> main implementation files
shared contracts -> Electron / React / SQLite
```

后续可以增加 ESLint/import 边界规则，但首阶段先通过目录、Review 和测试执行。

## 17. 质量门槛

- 每个模块可以独立初始化和释放。
- 一个模块数据库损坏时，其他模块仍可进入并显示错误隔离页面。
- 模块切换不重新创建无关服务或重复注册 IPC。
- 未进入的懒加载模块不进入首屏 Renderer bundle。
- 跨模块共享必须有公开契约和授权动作。
- 所有迁移保留旧用户数据。
- TypeScript、全量测试和生产构建通过。
- 不生成测试会话、示例书籍或真实候选人数据到用户正式目录。

## 18. 决策记录

| 日期 | 决策 | 原因 |
| --- | --- | --- |
| 2026-09-20 | 使用模块化单体，不拆多个 EXE | 共享桌面体验和基础能力，同时控制部署复杂度 |
| 2026-09-20 | 使用编译期模块注册表 | 当前不需要第三方动态业务模块，类型和调试体验更好 |
| 2026-09-20 | 模块拥有独立数据库 | 避免 Schema、隐私和生命周期互相污染 |
| 2026-09-20 | AI/RAG 基础设施共享，业务上下文不共享 | 面试和阅读都需要模型能力，但业务语义不同 |
| 2026-09-20 | 先做最小平台骨架，再继续面试核心流程 | 防止第三个模块加入时大规模返工 |
| 2026-09-20 | 暂不移动现有面试数据目录 | 数据迁移必须单独设计并验证，不能顺手改变路径 |
