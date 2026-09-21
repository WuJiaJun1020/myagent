# 面试问答题库架构与迭代计划

> 文档版本：1.1
> 对应客户端基线：0.6.0
> 最后更新：2026-09-21
> 状态：题库浏览与本地练习闭环已完成

## 1. 目标与边界

面试问答题库是智能面试模块内的独立子域，服务两类场景：

1. 面试前按岗位、技能和难度浏览、收藏与练习题目。
2. 后续由面试编排器通过结构化过滤和 RAG 选题，但必须把实际使用的题目版本复制为面试快照。

题库不使用 Pi Session、Pi Memory 或 Agent 工作区状态，也不把参考答案一次性装入普通聊天上下文。

`question_bank_*` 表保存可复用题目；现有 `interview_questions` 保存某一场面试实际使用的不可变快照。两者不能合并，否则题库更新会篡改历史面试。

## 2. 事实来源

- SQLite `userData/interview/interview.db` 是题目、版本、来源、收藏和导入记录的正式事实来源。
- `resources/interview-question-bank` 只保存随客户端发布的版本化内置数据包。
- Renderer Store 只保存筛选、分页、选中项和加载状态，可随时从主进程重建。
- 后续 LanceDB 只保存可重建的语义检索索引，不能替代 SQLite。
- 用户导入的文档、网页快照和解析结果只进入用户数据目录，不进入 Git 仓库。

## 3. 核心数据模型

### 3.1 稳定题目与不可变版本

```text
Question identity（stableKey）
  └─ Question revision（version + contentHash）
       ├─ prompt / intent / answerOutline
       ├─ rubric / commonMistakes / followUps
       ├─ kind / difficulty / roles / skills
       └─ source + locator
```

- `stableKey` 表示同一道逻辑题目。
- 已发布版本不可原地改写；内容变化产生新版本。
- `contentHash` 用于去重、损坏检测和幂等导入。
- 列表默认只展示每个 `stableKey` 的最新已发布版本。
- 收藏绑定稳定题目身份，不因内置数据包升级而丢失。

### 3.2 来源与可追溯性

来源统一分为：

- `builtin`：随客户端发布的审校数据包。
- `file`：用户导入的 PDF、DOCX、Markdown、TXT 等文件。
- `web`：用户主动导入的网页内容。
- `manual`：用户手工创建或编辑。
- `generated`：模型辅助生成，发布前必须可审核。

来源记录保留 URI 或本地文件身份、MIME、内容哈希、解析器及版本、原文定位信息和扩展元数据。题目详情必须可以追溯到来源，不以模型输出替代原始出处。

## 4. 统一导入管线

内置题库与未来文件、网页导入共用以下主流程：

```text
Acquire 获取内容
  -> Parse 解析为候选题目
  -> Normalize 统一字段与标签
  -> Validate 校验结构、权重和来源
  -> Deduplicate 按稳定键与内容哈希去重
  -> Review 草稿审核（内置可信包可直接发布）
  -> Publish 写入不可变版本
  -> Index 更新 FTS；后续异步更新向量索引
```

导入器只产生中立的候选题目，不直接操作界面或面试会话。每次导入保存 receipt，重复导入相同内容必须得到 `unchanged`，不能产生重复题目，也不能覆盖收藏状态。

未来扩展时新增的是 Source Adapter 或 Parser：

- 文件选择器负责获得用户授权的文件。
- PDF/DOCX/Markdown/TXT Parser 负责提取文本及页码、标题、字符范围。
- Web Adapter 只处理用户明确提交的 HTTP(S) 页面；遵守站点条款，不绕过登录、验证码或访问限制。
- AI Extractor 可以辅助拆题和补充标签，但结果先进入 `draft` / `reviewing`，不直接成为可信参考答案。

## 5. 第一阶段范围（已完成）

第一阶段只打通稳定、可恢复的本地题库浏览闭环：

- SQLite Schema v5 与旧库升级；检测到早期 v4 题库结构漂移时，只重建可由数据包恢复的 `question_*` 子系统，保留面试、岗位和面试题计划数据。
- 版本化内置题库数据包及启动时幂等同步。
- 至少覆盖 Python 后端、AI/Agent/RAG 与通用工程能力的首批中文题目。
- 按关键词、题型、难度、岗位和技能筛选。
- 分页列表与按需加载详情，避免把全部答案送入 Renderer。
- 查看答题思路、评分点、常见误区、追问和来源。
- 收藏与只看收藏；客户端重启后保留。
- FTS 搜索以 SQLite 为准，不依赖模型、网络或 LanceDB。

第一阶段不包括练习记录、AI 评分、文件/网页导入 UI、自动向量化和把题库题目加入真实面试；其中本地练习记录已在第二阶段补齐。

## 6. 后续阶段

### 阶段 2：本地练习闭环（已完成）

- 可从单题或当前筛选结果创建固定练习批次；批次开始时保存不可变题目快照。
- 支持草稿自动保存、提交回答、跳过、退出后继续和主动结束。
- 提交前不向 Renderer 返回参考框架、评分点、常见误区、追问或来源；提交后才进入复盘。
- 复盘时按 rubric 勾选覆盖项，完成自评并保存备注。
- 保存练习历史、薄弱技能和复习状态；客户端重启后可恢复唯一进行中批次。
- 使用 operation ID、状态版本和草稿版本抵御重复点击、乱序响应与并发覆盖。
- 当前阶段不调用模型。未来 AI 评分必须引用 rubric，并与原始回答、模型及提示词版本一起持久化。

### 阶段 3：文件和网页导入

- 支持 PDF、DOCX、Markdown、TXT 与用户提供的网页 URL。
- 提供解析预览、冲突处理、标签修正和发布审核。
- 保存导入 receipt、原文定位和失败原因；支持重新解析。

### 阶段 4：混合检索与面试选题

- SQLite FTS + LanceDB + RRF 混合召回。
- 按岗位技能、难度、历史覆盖和题目版本组成面试计划。
- 每次选择保存检索证据及题目快照，题库后续升级不改变旧面试。

## 7. IPC 与加载约束

题库浏览 IPC 使用独立命名空间：

```text
interview:question-bank:get-snapshot
interview:question-bank:list
interview:question-bank:get
interview:question-bank:set-favorite
```

本地练习使用另一组独立命名空间：

```text
interview:question-practice:get-overview
interview:question-practice:start-session
interview:question-practice:get-session
interview:question-practice:save-draft
interview:question-practice:submit-answer
interview:question-practice:complete-review
interview:question-practice:skip-question
interview:question-practice:abandon-session
interview:question-practice:list-history
```

- 所有输入在主进程重新校验。
- 列表 API 不返回完整答案、rubric 或来源元数据。
- 详情按选中题目加载。
- 搜索分页有固定上限，空查询不会一次读取全部题目。
- Renderer 只能通过 Gateway 访问，不直接使用 `ipcRenderer` 或 SQLite。
- 已存在练习的恢复、保存和历史读取不依赖内置题包再次初始化；只有创建新批次需要可用题库。

## 8. 隐私与安全

- 用户文档和网页正文默认只保存在本机。
- 未经明确确认，不把导入内容发送到模型 Provider。
- 日志不记录完整文档、参考答案或 API Key。
- 外部 URL 仅允许 HTTP(S)，并限制长度与重定向策略。
- 删除来源前提示其题目版本与练习/面试引用；历史面试快照不能被静默破坏。

## 9. 验收标准

- 新库启动后可看到内置题目；重复启动不会增加重复记录。
- Schema v3 数据库升级后原面试、岗位与题目计划保持不变。
- 早期 Schema v4 题库结构升级后可重新导入内置题库，且不会删除已有面试、简历、岗位、计划或面试题快照。
- 搜索、组合筛选、分页和详情读取无需网络或模型。
- 收藏后重启客户端仍保持，数据包升级不覆盖收藏。
- 列表不携带参考答案详情，详情不存在时返回 `null`。
- 数据包哈希或字段非法时给出明确错误，不导入半套数据。
- 单题和筛选练习均可创建固定队列；同一时刻只允许一个进行中批次。
- 提交回答前响应中不存在参考资料，提交后才能复盘和自评。
- 草稿、当前题、练习历史与复习状态在客户端重启后保持一致。
- 重复提交、重复自评、重复跳过或重复结束不会产生双份记录。
- 题库发布新版本后，既有练习仍使用开始时保存的题目和参考资料快照。
- TypeScript、全量测试和生产构建全部通过。
