# Pi Desktop Workspace

基于 Pi Agent 的桌面应用，将 Agent 工作区、智慧面试和知识工坊整合到同一个 Electron 客户端中。

## 主要功能

| 模块 | 功能 |
| --- | --- |
| Agent 工作区 | 独立聊天与工作模式、流式会话、工具调用与审批、会话历史、文件编辑、Git 差异审查、集成终端、资源中心与上下文管理 |
| 智慧面试 | 岗位库、新建面试、模拟候选人与面试导演、对话与评分、问答题库、算法练习与面试算法考核 |
| 知识工坊 | 导入文件、文本与网页，管理资料，批量生成题目，审核并发布到题库 |

- 统一的浅色 / 深色外观，支持简约灰、暖砂、雾蓝配色，以及强调色、字体和字号设置。
- 紧凑的会话过程展示、可展开工具详情、轮次导航和即时发送反馈。
- 内置浏览器，可在工作区打开网页、localhost 和本地 HTML，支持中文文件名。
- 算法编辑区使用 Monaco，支持代码编辑、补全、只读参考答案和 Python 运行判题。

当前仍在持续开发，语音输入尚未实现。

## 仓库结构

```text
pi-agent/           Pi Agent 源码与运行时
pi-desktop-client/  Electron + React + TypeScript 客户端
```

客户端通过 `file:../pi-agent/packages/coding-agent` 使用仓库内的 Pi Agent，通过 Electron IPC 和 Pi RPC 连接界面与运行时。Pi Agent 来源为 [earendil-works/pi](https://github.com/earendil-works/pi)，原始说明和许可证保留在其目录中。

## 首次安装

要求 Node.js 22.19.0 或更高版本。以下命令从仓库根目录执行：

```powershell
cd pi-agent
npm.cmd install --ignore-scripts
npm.cmd run hydrate:model-data
npm.cmd run build:offline

cd ..\pi-desktop-client
npm.cmd install --ignore-scripts
npm.cmd run dev
```

首次安装依赖和准备模型目录需要网络；`build:offline` 不代表初次安装全程离线。启动后在“设置 → 模型与 Agent”中配置模型提供商。

## 开发与构建

日常修改客户端，在 `pi-desktop-client/` 执行：

```powershell
npm.cmd run dev        # 开发启动
npm.cmd run typecheck  # 类型检查
npm.cmd test           # 单元与集成测试
npm.cmd run build      # 生产构建
```

只有修改 Pi Agent 源码时，才需要在 `pi-agent/` 重新执行 `npm.cmd run build:offline`。

Windows x64 打包在客户端目录执行 `npm.cmd run dist:win`（便携版）或 `npm.cmd run dist:win:setup`（安装版），产物位于 `pi-desktop-client/release/`。打包脚本会准备内置 Python 运行时；首次准备需要网络。

## 文档

- [客户端运行、配置与验收](pi-desktop-client/README.md)
- [前端界面注意事项](pi-desktop-client/AGENTS.md)
- [主题接入与界面验收](pi-desktop-client/docs/WORKSPACE_THEME_GUIDE.md)
- [界面优化设计记录](pi-desktop-client/docs/CLIENT_UI_REDESIGN_PLAN.md)
