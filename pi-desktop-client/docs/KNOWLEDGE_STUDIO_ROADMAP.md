# 知识工坊架构与开发路线图

> 文档版本：1.0
> 对应客户端基线：0.6.0
> 最后更新：2026-09-21
> 状态：首个可用闭环已落地，增强项继续按路线图推进

## 0. 当前实现状态

2026-09-21 已完成首个可用闭环：知识工坊作为顶级业务模块独立加载，支持本地资料导入与分段预览、后台批量生成、证据逐字校验、独立模型审核、人工编辑/通过/驳回，以及版本化 JSON 题包发布。数据保存在独立的 `knowledge-studio.db`、`sources/` 和 `artifacts/` 中，不读写 Pi 会话或智能面试数据库。

| 阶段 | 当前状态 | 后续增强 |
| --- | --- | --- |
| KS-001～KS-003 | 已完成首版 | 增加来源许可、隐私分级、不可变 revision 与更多解析器 |
| KS-004 | 核心流程已完成 | 增加阶段检查点、局部重试、预算预估和暂停/恢复 |
| KS-005 | 结构、Rubric、证据和独立模型审核已完成 | 增加精确/语义重复检测、主张级验证和能力覆盖分析 |
| KS-006 | 逐题编辑、通过、驳回已完成 | 增加不可变审核事件、批量审核、局部重新生成和重新验证 |
| KS-007 | 版本化 JSON 与内容哈希已完成 | 增加 ZIP、离线校验器和旧版本浏览 |
| KS-008 以后 | 未开始 | 按本文路线图继续推进 |

知识工坊是与 Agent 工作区、智能面试并列的独立业务模块。首个用途是把用户提供的 Agent 相关资料加工成可审核、可追溯、可发布的面试题包；后续可以扩展为阅读笔记、知识卡片、闪卡和 RAG 知识包等其他内容产物。

平台级边界继续遵循 [Pi Desktop 多业务模块架构规划](./PRODUCT_MODULE_ARCHITECTURE.md)。本文件只定义知识工坊自己的业务、数据、AI 工作流和实施阶段。

## 1. 核心决策：不复用 Pi Agent，复用共享模型运行时

题目生成不直接复用 Pi Agent Runtime、Pi Session、自由工具循环或会话上下文。

Pi Agent 适合开放式代码任务：它拥有项目目录、文件、Shell、工具调用、审批、会话历史和上下文管理。知识工坊执行的是输入和输出都必须可审计的批处理任务，更需要确定的阶段、检查点、成本和失败边界。直接复用 Pi Agent 会产生以下问题：

- 知识工坊依赖 Agent 工作区及其会话生命周期。
- 用户导入的私人资料可能进入普通 Pi 会话或 Memory。
- 自由工具循环降低任务的可复现性和成本可控性。
- 资料中的提示注入可能诱导 Agent 使用 Shell、网络或文件写入工具。
- 无法准确区分解析、出题、答案生成和验证分别在哪一步失败。
- 后续调整 Pi 上下文压缩、记忆或工具机制时会影响内容生产。

知识工坊应建立自己的 `KnowledgeGenerationWorkflow`，每一步都是具有结构化输入输出的专用 Worker：

```text
资料解析
  → 知识点提取
  → 题目设计
  → 答案与 Rubric 生成
  → 事实证据验证
  → 独立质量审核
  → 人工审核
  → 发布题包
```

这些 Worker 不是长期存在的聊天 Agent，也没有自由选择工具的权限。它们是由知识工坊后台任务调度的、可暂停和重试的模型步骤。

### 1.1 可以共享的能力

- Provider 凭据和模型目录。
- `ModelGateway`：结构化生成、流式结果、超时、取消、预算、Token 和错误。
- `EmbeddingGateway`：后续用于相似题提示和大规模资料检索。
- 全局主题、通知、日志和安全凭据。
- 后续平台级 `DocumentParser`、`BackgroundJobManager`、`DataDirectoryService` 和 `ExternalUrlPolicy`。

模型调用应使用独立元数据：

```ts
{
  moduleId: "knowledge-studio",
  purpose: "question-generation",
  privacyLevel: "private-document"
}
```

### 1.2 不能共享的状态

- Pi Session、Pi Memory 和会话历史。
- Agent 工作目录、项目配置、Skills、Shell 和文件编辑工具。
- Agent 审批状态和系统提示词。
- 智能面试数据库、练习历史、候选人和面试上下文。
- 其他模块的 Renderer Store 或内部 Service。

### 1.3 对当前实现的说明

当前中立的 `ModelGateway` 和 `EmbeddingGateway` 接口已经存在。`PiModelGateway` 可以作为底层 Provider 适配器执行无 Session 的简单模型请求；这表示复用了模型运行能力，而不是启动一个 Pi Agent 对话。

以下能力目前仍属于规划项，知识工坊实施时不能假定它们已经完成：

- 通用 `DocumentParser`。
- `EmbeddingGateway` 的生产适配器。
- 可恢复的 `BackgroundJobManager`。
- `DataDirectoryService`。
- 真正按首次进入启动 Main Module 的懒加载生命周期。
- 正式的跨模块 `QuestionPack` 公共协议。

当前桌面壳仍可能在应用启动时初始化 Agent 运行环境；知识工坊必须保证自己不创建 Pi Session、不访问 Agent 上下文。Agent 全局按需启动属于独立的平台优化，不阻塞知识工坊首版。

## 2. 模块边界

```text
Pi Desktop
├─ Agent Workspace
├─ Interview
└─ Knowledge Studio
   ├─ Source Library
   ├─ Parse Pipeline
   ├─ Generation Workflow
   ├─ Validation Center
   ├─ Review Center
   └─ Artifact Publisher
```

知识工坊使用独立的：

- `ProductModuleId`：`knowledge-studio`。
- Renderer Module、Main Module 和模块 Store。
- IPC 命名空间：`knowledge-studio:*`。
- 数据库 Schema 和迁移版本。
- Prompt、输出 Schema、生成任务与质量规则。
- 原始资料、解析结果、候选题和发布产物目录。

知识工坊不能直接写入 `interview.db`；智能面试也不能查询知识工坊数据库。

## 3. 数据目录

目标目录如下：

```text
userData/
└─ modules/
   ├─ agent/
   ├─ interview/
   │  └─ interview.db
   └─ knowledge-studio/
      ├─ knowledge-studio.db
      ├─ sources/
      ├─ parsed/
      ├─ artifacts/
      └─ temp/
```

- `sources/` 保存不可变原始资料快照，不放入 Git 仓库。
- `parsed/` 保存可重建的解析中间结果。
- `artifacts/` 保存已发布、可独立验证的内容包。
- `temp/` 只保存可安全清理的临时文件。
- SQLite 是工作流状态和元数据的事实来源；向量索引只能是可重建派生数据。

## 4. 核心数据链路

```text
SourceDocument
  └─ SourceRevision
       └─ SourceSegment
            └─ GenerationBatch
                 └─ QuestionCandidate
                      ├─ CandidateEvidence
                      ├─ ValidationRun
                      └─ ReviewEvent
                           └─ QuestionPackArtifact
```

建议实体：

- `source_documents`：资料稳定身份、标题、来源、权利和隐私信息。
- `source_revisions`：不可变原始内容快照、哈希、格式和采集时间。
- `source_segments`：带页码、标题、字符范围或 URL 定位的规范化片段。
- `import_runs`：获取、解析、清洗的状态、版本、警告和错误。
- `generation_batches`：目标岗位、能力域、题型、难度、数量、模型、Prompt、预算和任务状态。
- `question_candidates`：尚未发布的题目、答案、Rubric、误区和追问。
- `candidate_evidence`：题目、答案要点和评分项对应的原文证据。
- `validation_runs`：确定性规则、证据验证、模型审核和重复检测结果。
- `review_events`：人工修改、通过、驳回、重新生成及其原因。
- `artifacts`：不可变的版本化发布产物和内容哈希。

## 5. 生成与验证原则

### 5.1 分步生成

知识点、题目、答案和审核不应在一次模型调用中完成。首版至少拆成：

1. 知识点提取。
2. 候选题生成。
3. 答案、Rubric、常见误区和追问生成。
4. 答案事实主张与来源证据绑定。
5. 使用独立上下文进行质量审核。

如条件允许，生成与审核可以选择不同模型，以减少同一模型重复认可自身错误的相关性偏差。

### 5.2 四层质量门禁

1. **结构规则**：必填字段、受控标签、Rubric 数量和权重、引用完整性。
2. **证据验证**：将关键主张标记为 `supported`、`contradicted`、`insufficient` 或 `not_applicable`。
3. **独立模型审核**：检查可回答性、歧义、难度、完整性、答案越界和相似题。
4. **人工审核**：最终通过、修改、驳回或重新生成。

关键答案处于 `contradicted` 或 `insufficient` 时不得发布。系统不使用无法解释的“可信度 95%”作为发布依据。

### 5.3 发布约束

- LLM 只能生成候选题，不能自动写入正式题库。
- 未通过人工审核的内容不能进入发布产物。
- 修改已发布内容必须生成新版本，不能覆盖旧版本。
- 所有生成和验证都保存 Provider、模型、Prompt 版本、输入哈希、输出哈希、Token 和时间。

## 6. 跨模块产物

首种产物定义为版本化 `QuestionPackArtifactV1`：

```ts
type QuestionPackArtifactV1 = {
  schemaVersion: 1;
  artifactId: string;
  version: string;
  title: string;
  contentHash: string;
  generatedAt: string;
  sources: SourceSummary[];
  questions: PublishedQuestion[];
  validationSummary: ValidationSummary;
};
```

首版只导出 JSON 或 ZIP 文件，不直接连接智能面试。题包协议稳定后，智能面试通过显式用户操作导入：

```text
Knowledge Studio
  → 发布 QuestionPack
  → 用户选择导入
  → Interview 校验 Schema、哈希和冲突
  → 复制不可变题目和来源快照
  → 保存导入回执
```

知识工坊删除任务、资料或产物后，已经导入智能面试的题目不能受影响。

## 7. 分阶段开发计划

### KS-001：架构与安全边界

确定模块 ID、目录、生命周期、IPC、共享能力、隐私等级和题包协议草案。补齐 Prompt Injection、版权、模型成本和跨模块依赖约束。

**验收：**知识工坊不导入 Agent 或 Interview 内部实现，进入模块不会创建 Pi 会话或打开面试数据库。

### KS-002：独立模块骨架

建立 Renderer/Main Module、Preload API、模块 Store、独立数据库、迁移和错误边界；同时补齐新模块所需的最小数据目录能力。

**验收：**模块可独立启动和释放，异常不影响 Agent 工作区与智能面试，重启后数据库状态正常。

### KS-003：资料库与基础解析

先支持粘贴文本、TXT 和 Markdown，再接入 DOCX、文本型 PDF、HTML 和用户主动提交的单页 URL。保存原始快照、来源、许可、隐私级别和内容哈希，并提供分段预览。

**验收：**重复导入可识别，每个片段能定位回原文，单个解析失败不会污染其他资料。

### KS-004：批量候选题生成

实现“覆盖计划 → 知识点 → 题目 → 答案 → Rubric → 误区 → 追问 → 引用”的结构化工作流。任务支持进度、取消、分步重试和检查点恢复。

**验收：**一次可稳定生成约 20 道候选题；失败后无需从头执行；任何结果都只能进入候选区。

### KS-005：校验与质量门禁

加入字段和权重规则、来源证据验证、独立模型审核、精确重复检测以及 Agent 能力域覆盖检查；Embedding 相似题检测在生产适配器完成后接入。

**验收：**关键结论无依据、相互矛盾或结构不完整时禁止发布；相似题只提示人工处理，不自动合并。

### KS-006：人工审核中心

提供候选题、答案、Rubric、原文证据和校验结果的对照界面，支持逐字段编辑、驳回、局部重新生成、重新验证和批量审核。

**验收：**每个正式产物都拥有完整人工审核记录，审核后修改会使原审核失效。

### KS-007：题包发布与导出

实现版本化 `QuestionPackArtifactV1`、完整性校验、内容哈希以及 JSON/ZIP 导出。保留旧版本，不因新发布覆盖已有产物。

**验收：**题包可在干净环境中独立验证和读取，内容被篡改时能够检测，删除生成任务不破坏已发布文件。

### KS-008：首批 Agent 正式题包

使用知识工坊生产第一批人工审校的 Agent 工程题，覆盖 Agent 模式、Tool Calling、MCP、Context/Memory/RAG、多 Agent、可靠性、评测、可观测性和安全。

**验收：**题目具有可定位来源、明确答案边界、权重完整的 Rubric、适用版本和人工审核记录；当前示例题不与正式题混为一谈。

### KS-009：格式与规模扩展

按需加入扫描 PDF、图片 OCR、PPTX、表格、Git 仓库、ZIP 和音视频转写，并增加大任务并发限制、预算、暂停、恢复和批量处理。

**验收：**新增格式只增加 Source Adapter，不改变候选题和发布模型；低质量解析会进入人工确认，而不是静默生成错误内容。

### KS-010：智能面试显式导入

在题包协议稳定后增加智能面试连接器。导入前展示来源、版本、题量、重复和冲突，用户确认后由 Interview 保存自己的不可变副本和回执。

**验收：**没有自动跨模块写入；重复导入可以识别；知识工坊停用或删除后不影响已导入题目。

### KS-011：评测、检索与生产化

建立人工金标准样本，比较不同模型和 Prompt；加入语义重复提示、大规模资料检索、成本统计、备份、删除和质量回归。向量索引在这一阶段作为可重建能力接入。

**验收：**固定评测集能够发现模型或 Prompt 升级引入的退化，索引删除后可重建，统计不依赖 Renderer 状态。

## 8. 首个可用版本

第一里程碑包含 `KS-001` 至 `KS-007`：

```text
导入资料
  → 解析预览
  → 批量生成候选题
  → 规则与证据校验
  → 人工审核
  → 导出 QuestionPack
```

第一里程碑明确不包括：

- 直接写入智能面试数据库。
- Pi Agent 会话或自由工具调用。
- 扫描 PDF、复杂 OCR、音视频和批量爬站。
- 无人工审核的自动发布。
- 大规模向量检索。
- 正式面试、练习历史或 AI 面试评分。

先使用少量 Agent 官方资料验证来源追踪、生成质量、人工审核成本、模型费用和故障恢复。题包协议与质量门禁稳定后，再开始跨模块导入。

## 9. 隐私、安全与版权

- 导入资料默认只保存在本机。
- 文档内容始终视为不可信数据，不能获得 Shell、文件写入或任意网络工具权限。
- 未经用户确认，不把私人资料片段发送给模型 Provider。
- 调用前展示 Provider、模型、发送范围和预计 Token；支持取消。
- 日志不能记录 API Key、完整私人文档或未脱敏敏感字段。
- 网页导入不绕过登录、验证码、robots 或站点访问限制。
- 保存作者、URL、许可、采集时间、内容哈希和原文定位。
- 未知授权资料可以作为用户本地私有来源，但不能进入随应用公开分发的题包。
- 模型生成不是版权或事实正确性的证明，人工审核仍是最终门禁。

## 10. 质量门槛

- 所有已发布题目都能定位到来源，或明确标记为项目原创并保留作者声明。
- 所有 AI 辅助内容都有人工审核记录。
- Rubric 权重总和为 100，关键项和答案边界明确。
- 关键答案主张不存在未处理的 `contradicted` 或 `insufficient`。
- 重复任务、重试和客户端重启不会产生重复候选题或重复发布版本。
- 相同输入、模型、Prompt 和 Schema 可以追踪到对应生成与验证记录。
- 模块数据库损坏或模型调用失败不影响 Agent 和 Interview 模块进入。
- TypeScript、数据库迁移、IPC、任务恢复、全量测试和生产构建必须通过。

## 11. 决策记录

| 日期 | 决策 | 原因 |
| --- | --- | --- |
| 2026-09-21 | 知识工坊作为顶级业务模块 | 内容生产以后可服务面试、阅读和其他系统，不应属于面试内部页面 |
| 2026-09-21 | 不复用 Pi Agent Session 和工具循环 | 保证隐私、可复现、可恢复、成本和权限边界 |
| 2026-09-21 | 通过共享 `ModelGateway` 调用模型 | 复用 Provider 与凭据，但不共享业务上下文 |
| 2026-09-21 | 首版采用受控多步骤工作流 | 比自治 Agent 更容易验证、审计和重试 |
| 2026-09-21 | LLM 结果只进入候选区 | 模型不能成为自己的最终事实审核者 |
| 2026-09-21 | 先导出题包，后连接智能面试 | 先稳定产物协议，避免两个模块同时反复修改 |
| 2026-09-21 | 模块数据库相互隔离 | 防止生命周期、Schema、隐私和删除语义互相污染 |
