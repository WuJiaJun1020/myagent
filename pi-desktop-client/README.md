# Pi Desktop Client

基于 Electron、React 和 TypeScript 的 Pi 桌面客户端，包含 Agent 工作区、智慧面试和知识工坊。当前版本为 `0.6.0`，仍在持续开发。

功能概览与首次安装步骤见[仓库首页](../README.md)。本目录依赖同仓库内已构建的 Pi Agent，不能只安装客户端依赖就跳过运行时准备。

## 本地运行

要求 Node.js 22.19.0 或更高版本。完成仓库首页的安装步骤后，在本目录执行：

```powershell
npm.cmd run dev    # 前端热更新，输入 r 编译后端并重启
npm.cmd start      # 构建后启动
```

开发模式首次启动会编译后端并打开 Electron，前端继续通过 Vite 热更新。主进程、preload 或后台导入线程的代码保存后不会自动编译或重启；改完后在开发终端输入 `r` 回车，才会增量编译后端并重启 Electron。编译失败时保留现有窗口，修复后再次输入 `r`。关闭窗口或按 `Ctrl+C` 退出开发服务。Vite 端口变化时，客户端会使用实际地址。

后端更新属于进程重启，会中断当前任务并重置未持久化的界面状态；前端仍使用 Vite 热更新。打包版本不启用这些开发功能。

Vite 只扫描客户端 `index.html` 入口，并排除模型、Python 环境、索引缓存和打包产物的文件监听，避免智慧图书本地环境拖慢首次模块加载。修改 `vite.config.ts` 后建议完整重启 `npm.cmd run dev`；`r` 只重启 Electron。可用 `node tests/e2e/verify-module-loading.mjs` 在独立冷缓存下检查三个业务模块的加载耗时。

需要准备算法判题的内置 Python 时执行 `npm.cmd run prepare:python:win`。该脚本下载并校验 Windows x64 Python 嵌入式运行时，打包命令会自动执行此步骤。

## 桌宠

左下角设置按钮左侧的爪印是桌宠入口。点击后选择“阅读（8 帧）”“下棋（8 帧）”或“种金雷竹（12 帧）”，桌宠显示在透明置顶窗口中。拖动有图像的部分可移动；右键或悬停后的操作条可以切换动作和隐藏。透明空白部分不拦截鼠标。拖动使用系统鼠标坐标，按住不动不会移动，超过 4 px 的移动门槛才开始拖动。

三个动画分别保存大小，面板可调整 1%～100%，100% 对应各自原始分辨率：阅读 1254×1254、下棋 256×128、种竹 1500×1254。下棋默认 100%，阅读和种竹默认 20%；旧版大小会自动换算并保留。播放使用工程保存的逐帧时长和循环设置，非循环动画停留在最后一帧，再次选择该动画可从头播放。显示状态、动作、各动画大小和位置保存在 Pi Desktop 用户数据目录的 `desktop-pet/settings.json`，重启恢复。正常退出 Pi Desktop 后桌宠也退出。

动画资源位于 `resources/desktop-pets/han-li/`，打包时复制到安装资源目录；素材来自桌宠工坊已保存的三个工程，保持图层位置、旋转中心、顺序与透明度，原始工程不修改。今后修补后可运行 `tests/helpers/export-desktop-pets.cjs` 重新导出：设置 `PI_PET_EDITOR_DIR` 为编辑器目录、`PI_PET_EXPORT_SOURCE` 为包含 `reading` / `chess` / `bamboo` 三个工程文件夹的目录、`PI_PET_EXPORT_OUTPUT` 为动画资源目录，并用 Electron 启动该脚本。开发中的 Pi Desktop 重启后读取更新的资源。

桌宠显示范围使用整段动画所有非透明像素的共同边界，去掉外围透明留白，不改 PNG 或逐帧改变裁边位置。屏幕边界按有效图像计算，窗口的透明留白可越过左侧和上侧边缘；原图大于屏幕时仍可移动并保持部分图像可见。拖动过程中忽略异常鼠标坐标，丢失页面鼠标捕获不会提前结束拖动，主进程同时监听松手事件。

真实桌宠验收：构建后执行 `node tests/e2e/verify-desktop-pet.mjs`，使用独立数据目录验证三个动画、入口、透明窗口、切换、原始分辨率上限、独立大小、拖动防漂移、旧设置迁移和重启恢复。

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
| 会话过程 | `node tests/e2e/verify-activity-ui.mjs` |
| 消息发送与轮次导航 | `node tests/e2e/verify-chat-ui.mjs` |
| 内置浏览器 | `node tests/e2e/verify-browser-ui.mjs` |

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

### 会话斜杠指令

输入 `/` 查看完整列表，支持搜索、上下键选择；点击或 Enter 立即执行，Tab 仅补全以便添加参数。已接入 Pi 的 23 个内置指令，并保留桌面端的 `/chat`、`/work`、`/abort`，以及运行时加载的扩展、模板和技能指令。

- `/settings`、`/model`、`/thinking`、`/scoped-models`、`/trust` 打开对应设置；模型和推理级别仍支持直接传参。
- `/login`、`/logout` 打开账号管理，选择服务商后执行认证或退出。
- `/tree`、`/fork`、`/session` 打开会话树与统计；`/fork <entryId>` 可直接创建分支。`/resume` 打开会话选择器，支持 `/resume <sessionId>`。
- `/export [html|jsonl]`、`/import` 通过文件对话框选择位置；`/clone` 复制会话，`/copy` 复制最后一条助手回复。
- `/share` 确认后将 HTML 上传到非公开 GitHub Gist，需要安装并登录 GitHub CLI；桌面端不使用 Radius 分享通道。
- `/reload` 重载资源并更新指令列表，`/changelog` 查看随运行时附带的 Pi 更新日志，`/hotkeys` 展示桌面端及已注册扩展的快捷键，`/quit` 确认后关闭客户端。
