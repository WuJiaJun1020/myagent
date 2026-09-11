# Pi Desktop Workspace

本仓库统一维护 Pi Agent 源码和桌面客户端。

## 目录

- `pi-agent/`：Pi Agent 源码，基于 [earendil-works/pi](https://github.com/earendil-works/pi) 进行本地定制。
- `pi-desktop-client/`：Electron + React 桌面客户端。

桌面客户端通过 `file:../pi-agent/packages/coding-agent` 使用同一仓库内的 Pi Agent 源码。

## 首次安装

需要 Node.js 22.19.0 或更高版本。

```powershell
cd pi-agent
npm.cmd install --ignore-scripts
npm.cmd run hydrate:model-data
npm.cmd run build:offline

cd ..\pi-desktop-client
npm.cmd install --ignore-scripts
```

## 开发运行

修改 Pi Agent 源码后，先重新构建：

```powershell
cd pi-agent
npm.cmd run build:offline
```

启动桌面客户端：

```powershell
cd pi-desktop-client
npm.cmd run dev
```

Pi Agent 原始代码及其许可证保留在 `pi-agent/` 目录中。
