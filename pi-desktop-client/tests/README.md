# 测试目录

所有客户端测试代码、测试替身、样本和验收脚本集中在这里；`pi-agent` 上游源码保持原样。

| 目录 | 用途 |
| --- | --- |
| `unit/` | Vitest 单元测试，按 `src/` 的模块路径排列 |
| `node/` | Node 原生测试，包括开发启动器与目录规则检查 |
| `integration/` | SQLite、LanceDB、Worker 及安装包验证 |
| `e2e/` | Electron 界面验证、预览和辅助页面 |
| `python/` | 模型 HTTP 服务、题库去重及 GPU 数值验证 |
| `helpers/` | 公共测试替身与样本构造器 |
| `fixtures/` | 可提交的固定测试输入 |

从客户端目录执行：

```powershell
npm.cmd test                         # 单元测试 + Node 测试；不启动 GPU 模型
npm.cmd run test:unit -- smart-library
npm.cmd run test:node
npm.cmd run test:integration          # 先编译后端，使用 Electron Node 和模拟模型接口
npm.cmd run test:integration -- index
npm.cmd run test:integration -- strategies # 独立方案索引、改写、比较报告、取消与历史引用
npm.cmd run build
npm.cmd run test:e2e -- library-ui    # 独立测试数据，浅深色及窄布局
npm.cmd run test:e2e -- library-evaluation-timings # 耗时统计与旧报告兼容；不访问真实图书或 GPU
npm.cmd run test:e2e -- library-strategies # 配置、复制/重命名、方案索引、比较报告、浅深色/窄窗口
npm.cmd run test:python               # Python HTTP 和去重测试；不加载权重
npm.cmd run capture:readme            # 使用公开模拟数据生成文档截图，输出到 .cache/readme
```

GPU、真实模型和已有书籍评测属于手动验收，不放进默认测试：

```powershell
node tests/e2e/verify-library-runtime.mjs
node tests/e2e/verify-library-models.mjs
node tests/integration/verify-library-packaged-models.mjs  # 外部 GPU 环境 + 安装目录结构
.\.cache\library-model-runtime\Scripts\python.exe tests/python/library-models/verify_batch_gpu.py --output .cache/library-batch-gpu/report.json # 批量 1/4 分数与速度对比
$env:ELECTRON_RUN_AS_NODE='1'
& .\node_modules\electron\dist\electron.exe tests/integration/verify-library-retrieval-gpu.cjs
& .\node_modules\electron\dist\electron.exe tests/integration/verify-library-context-existing.cjs # 已有评测原文组装对比，仅只读访问
Remove-Item Env:ELECTRON_RUN_AS_NODE
```

验收脚本原有的 `verify:*` npm 命令保留，并已更新目录。修改安装包前先执行 `verify:package-deps`；发布构建会单独编译 `integration/packaged-smoke.ts` 供安装包自检，日常后端编译不包含该测试实现。

测试不能依赖上一次运行生成的缓存。EPUB 通过 `helpers/library-epub.cjs` 当场构建；输出报告、截图和临时数据库放 `.cache/` 或临时目录，不提交 Git。客户端运行时题库和算法判题资料属于产品资源，继续放 `resources/`。
