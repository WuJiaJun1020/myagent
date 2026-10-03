# 图书本地模型运行环境

客户端按钮与 `npm run library:models` 共用路径解析器。优先级为：环境变量 → 图书数据目录中的 `model-runtime.json` → 当前环境默认路径。读取配置发生在启动模型时，不增加客户端或其他模块的冷启动工作。

开发版继续使用已有 `.cache/library-model-runtime` 的 Python 和 `models/smart-library` 的权重，无需移动或重新下载。

安装版从 `resources/library-model-service/` 加载随程序发布的服务脚本和版本清单；Python 与 CUDA 权重保留在安装目录之外。默认位置是图书数据目录下的 `runtime/python/`、`models/`。也可以复用现有环境，在错误提示中给出的 `model-runtime.json` 文件中填写绝对路径：

```json
{
  "pythonExe": "D:/Codex-code/pi-agent学习/pi-desktop-client/.cache/library-model-runtime/Scripts/python.exe",
  "modelsDirectory": "D:/Codex-code/pi-agent学习/pi-desktop-client/models/smart-library"
}
```

`modelsDirectory` 内包含 `Qwen3-Embedding-0.6B`、`Qwen3-Reranker-0.6B`，及已下载的其他可选重排模型目录。仍使用 CUDA 与原有高精度权重，不自动降到 CPU 或量化模型。Python 环境必须已安装 CUDA PyTorch 和服务所需依赖；本次没有新增自动环境安装功能。

也可以在启动客户端的环境中设置 `PI_LIBRARY_PYTHON`、`PI_LIBRARY_MODELS`。CLI 使用默认用户数据目录；若客户端改过数据目录，可再设置 `PI_LIBRARY_DATA_ROOT`，两者即可读取同一配置。

需要新建外部环境时，可运行部署脚本并显式指定目录：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/library-models/setup.ps1 -RuntimeDirectory D:/PiModels/python -ModelsDirectory D:/PiModels/weights
```

服务代码与模型清单进入安装包；测试、缓存、Python GPU 环境和模型权重不进入安装包。已有外部本地接口仍可直接配置使用，无需由客户端启动服务。

内置服务每批重排 4 个候选片段，尾批按实际数量处理；一次 HTTP 请求仍可包含最多 16 个片段，原文与模型精度不变。千问仍为 BF16，两个 BGE 模型仍为 FP32。BF16 在批量大小变化时可能产生数值差异，分数接近的候选顺序可能变化；比较效果时应重新运行评测。`/health` 的 `rerankBatchSize` 可确认服务是否已使用新版代码。

更新服务代码后，在客户端停止并重新启动本地模型服务；开发后端另用 `r` 重启，无需重建索引。评测组装原文只读取 SQLite 中的精确字符范围，不建立整本书的阅读页码映射；点击引用时仍按原来的逻辑定位阅读页，不增加磁盘缓存或索引副本。
