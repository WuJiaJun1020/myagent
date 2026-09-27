# Pi Desktop Client

基于 Electron、React 和 TypeScript 的 Pi 桌面客户端，包含 Agent 工作区、智慧面试和知识工坊。当前版本为 `0.6.0`，仍在持续开发。

功能概览与首次安装步骤见[仓库首页](../README.md)。本目录依赖同仓库内已构建的 Pi Agent，不能只安装客户端依赖就跳过运行时准备。

## 本地运行

要求 Node.js 22.19.0 或更高版本。完成仓库首页的安装步骤后，在本目录执行：

```powershell
npm.cmd run dev    # 开发模式
npm.cmd start      # 构建后启动
```

需要准备算法判题的内置 Python 时执行 `npm.cmd run prepare:python:win`。该脚本下载并校验 Windows x64 Python 嵌入式运行时，打包命令会自动执行此步骤。

## 模型配置与数据

打开“设置 → 模型与 Agent”管理提供商。支持 Pi 提供商注册表中的 API Key、OAuth / 订阅登录及设备码等认证方式，具体可用方式由提供商决定。

- Agent 沿用 Pi 的模型目录、认证和会话管理，界面通过 IPC 与主进程通信，再由主进程通过 JSONL RPC 连接 Pi。
- Pi 保存的认证信息位于用户目录的 `~/.pi/agent/auth.json`；客户端不把密钥写入前端设置或 `localStorage`。
- 智慧面试和知识工坊的数据由客户端本地管理。升级或迁移前应保留所需的用户数据。
- 新电脑仍需配置自己的模型账号，安装包不包含开发者的凭据和会话。

## 界面与能力边界

- 三个模块复用主题与公共控件；外观设置支持浅色、深色、跟随系统，以及配色、强调色和字体调整。
- Agent 的聊天与工作模式独立；会话过程根据真实消息和工具事件显示，支持折叠与轮次跳转。
- 工作会话按项目归组，项目顺序固定、空项目持久保存；项目名称只展开列表，具体会话通过 Pi 原生机制恢复。每个项目旁的 `＋` 用于在该目录新建工作会话。
- 文件修改卡片只追踪当前项目目录内的变化，跳过依赖、构建输出等目录；不记录项目目录外的修改。
- 内置浏览器支持网页与本地 HTML 预览，使用隔离的网页视图；目前没有多标签、下载管理或持久登录功能。
- 算法编辑采用 Monaco；Python 补全包括内置名称和文档词汇，未接入语言服务器或 AI 补全。
- 语音输入尚未实现。

前端修改遵循 [AGENTS.md](AGENTS.md)，详细主题规范见[主题接入说明](docs/WORKSPACE_THEME_GUIDE.md)。

## 检查与界面验收

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run verify:renderer
```

专项界面验收使用隔离测试数据；截图和结果保存在 `.cache/`，不代表真实模型或发布流程已完成端到端验证。

| 范围 | 命令 |
| --- | --- |
| 主题与工作区 | `npm.cmd run verify:themes` |
| 智慧面试与算法界面 | `npm.cmd run verify:interview-ui` |
| 知识工坊 | `npm.cmd run verify:knowledge-ui` |
| 会话过程 | `node scripts/verify-activity-ui.mjs` |
| 消息发送与轮次导航 | `node scripts/verify-chat-ui.mjs` |
| 内置浏览器 | `node scripts/verify-browser-ui.mjs` |

后三项需先完成生产构建；不要与构建并行运行。视觉样板可用 `npm.cmd run preview:workspace` 生成，不能替代实际交互验收。

仓库首页截图可在生产构建后执行 `node scripts/capture-readme.mjs` 重新生成。脚本使用真实组件和隔离的虚构数据，输出到 `docs/screenshots/`；不读取个人会话、不调用模型。

## Windows x64 打包

```powershell
npm.cmd run dist:win        # 便携版
npm.cmd run dist:win:setup  # 安装版
```

产物位于 `release/`，文件名中的版本号来自 `package.json`：

- `Pi-Desktop-<version>-x64.exe`
- `Pi-Desktop-Setup-<version>-x64.exe`

打包包含 Electron、Pi 运行时和算法判题所需的 Python。目标电脑无需另行安装 Node.js 或 Pi，在线模型仍需网络及有效认证。

打包仅保留中英文 Electron 界面语言包；Monaco 使用 Vite 编译产物，不再重复携带整个开发包。依赖的 source map 和未使用的 PDF 浏览器构建不进入安装包，许可证保留。LanceDB 原生库、PDF/DOCX 解析依赖与内置 Python 属于运行必需内容，不按体积直接删除。

打包后执行 `npm.cmd run verify:package` 检查随包运行时，再执行 `npm.cmd run verify:package-deps` 验证包内 LanceDB 读写与向量检索、PDF/DOCX 解析、Pi SDK 和终端。后者同时检查裁剪规则，测试数据写入 `.cache/package-audit/`。LanceDB 的 Apache Arrow 需显式保留为生产依赖，避免打包器遗漏 peer dependency。

在可交互的 Windows 桌面会话中执行 `npm.cmd run verify:portable` 检查便携外壳。以上检查不能替代安装后的完整业务验收。
