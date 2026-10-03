# 智慧图书阶段 0：测试与环境说明

更新：2026-09-28。当前使用千问向量模型与三个可切换重排模型，统一 CUDA GPU 推理。真实接口已通过小样本测试；尚未建立图书索引或接入问答。须经用户验收后才能进入阶段 1。

## 当前本地模型

| 能力 | 官方模型 | 精度 | 加载方式 |
|---|---|---|---|
| 向量化 | Qwen/Qwen3-Embedding-0.6B | 原始 BF16，未量化 | PyTorch + Transformers，CUDA |
| 重排 | Qwen/Qwen3-Reranker-0.6B | 原始 BF16，未量化 | 同一进程、同一 CUDA 设备 |
| 重排备选 | BAAI/bge-reranker-base | 官方 FP32，未量化 | 同一 PyTorch/Transformers CUDA 服务 |
| 重排备选 | BAAI/bge-reranker-v2-m3 | 官方 FP32，未量化 | 同一 PyTorch/Transformers CUDA 服务 |

- 启动默认加载千问向量与千问重排；测试其他重排模型时卸载旧重排、加载所选模型，向量模型保留。一次只常驻一个重排模型。停止服务后释放，不使用 Ollama、ONNX 或 CPU 回退。
- 权重与分词器：项目 `models/smart-library/Qwen3-Embedding-0.6B/` 和 `models/smart-library/Qwen3-Reranker-0.6B/`。
- 两份 safetensors 各约 1.19GB，合计约 2.38GB，不含分词器和运行依赖。BF16 是官方原始精度，不做低比特量化；转成 FP32 不会恢复额外权重信息。
- 新增 BGE Base / v2 M3 权重分别约 1.11GB / 2.27GB，放在同级 `bge-reranker-base/` 和 `bge-reranker-v2-m3/` 目录；已下载并逐文件校验。所有权重合计约 5.76GB，不含运行依赖与分词器。
- Python GPU 环境独立放在 `.cache/library-model-runtime/`；未改用户 Conda 环境。推理软件版本固定并记录于 `scripts/library-models/environment-win-cu124.txt`。
- 权重版本和文件哈希固定于 `scripts/library-models/manifest.json`。下载脚本逐文件校验后才激活，推理时只读取本地 safetensors，禁止联网下载模型。
- PyTorch 2.6.0+cu124、Transformers 4.57.6，使用 SDPA；要求 CUDA 与 BF16 支持。GPU 不可用时启动失败，不静默回退。
- 向量采用末 token 池化和 FP32 L2 归一化，维度 1024；查询可通过 `input_type: query` 添加检索指令，原文默认不添加指令。
- 千问重排读取 yes/no 输出头 logits，以 FP32 累积与 softmax 评分；BGE 使用分类 logits 的 sigmoid。都不走聊天生成接口，不受 top-20 概率限制。
- 阶段 0 输入预算：BGE Base 每条 512 tokens，其余每条 4096 tokens（包含问题与指令）。这是服务预算，不等于所有模型原生上限。超限返回 422，禁止静默截断。向量微批次 2 条，重排逐条处理，单请求最多 16 条。
- 服务只监听 `127.0.0.1:18081`，重叠推理请求返回 429。请求数据不写日志，浏览器 Origin 请求被拒绝，不上传图书。

## 用户测试步骤

1. 旧模型服务若在运行，先 Ctrl+C 停止，再在客户端目录执行 `npm.cmd run library:models`。等待 `Ready`；初始两个千问模型均为 `cuda:0`、`torch.bfloat16`，切换 BGE 后重排为 `torch.float32`。
2. 在开发终端输入 `r` 回车更新主进程；未启动则运行 `npm.cmd run dev`。
3. 进入智慧图书，打开“本地检索模型”。两个地址应为：
   - 向量：`http://127.0.0.1:18081/api/embed`，模型 `Qwen/Qwen3-Embedding-0.6B`。
   - 重排：`http://127.0.0.1:18081/rerank`，模型 `Qwen/Qwen3-Reranker-0.6B`。
4. 旧阶段 0 的 Ollama/BGE 默认预设会自动迁移；自定义地址和模型保留。点击保存，关闭重开，确认配置正常。
5. 向量测试应显示 1024 维。重排可选择三个模型和八组案例：直接证据、同义改写、因果、时间限定、否定条件、别名指代、多段证据、无答案。阅读原文和预期，再测试并比较实际排名与逐段分数。同一题的已测模型记录保留在本次弹窗内，关闭后清空；模型配置可保存。仅发送自编示例，不读取图书、不建索引。
   - 多段证据题要求相关两段排前两名，二者先后不限；无答案题不计算首位命中。
   - 不同模型分数不能直接比大小；优先比较证据排序。耗时包含模型切换加载，首次结果不适合直接比较推理速度。
6. 可访问 `http://127.0.0.1:18081/health` 查看 GPU、精度和显存信息。关闭模型服务终端后应无法测试，重新启动可恢复。
7. 检查书架、阅读器、浅深色和窄窗口；复核评测题集，提出难题或体验建议。本阶段尚无图书问答入口。

本机模型和依赖已准备好。以后重建开发环境时，可运行：

```powershell
powershell -NoProfile -File scripts/library-models/setup.ps1 -Python 'C:/Users/wujiajun/anaconda3/python.exe'
```

Python 路径按本机实际情况替换。该命令创建隔离环境、安装 CUDA PyTorch、下载并校验权重。当前采用独立服务启动，不自动随客户端运行；自动生命周期和正式安装包留待后续阶段。权重与运行环境已排除出 Git，未塞进 EXE。

## 实际验证结果

- RTX 4060 8GB；两个模型确认运行在 CUDA/BF16，PyTorch 分配显存约 2281MiB，短样本峰值约 2288MiB。这不包含全部驱动占用，也不代表长输入峰值。
- 官方完整前向与优化评分对照：无关原文约 0.001245 / 0.001226；相关原文约 0.999809 / 0.999821，差异来自 FP32 输出头累积，远小于测试容差。
- 四组中英文诊断排序全部首位正确；候选反转后对应得分一致；超限输入 422，错误模型名 400。
- 客户端真实小样本接口：两句向量约 72ms，两句重排约 85ms；只是本次测量，不是整书性能或效果结论，也未证明 GPU 对所有短请求都快于 CPU。
- 三模型 × 八案例真实 GPU 对比完成。七道有预期题中千问符合 6 道（时间限定题未符合），BGE Base 和 v2 M3 各符合 7 道；无答案题独立观察，不计命中。这不是正式准确率，也没有用这些样本调参。CUDA 分配显存约为千问组合 2283MiB、BGE Base 组合 2206MiB、v2 M3 组合 3311MiB，非长输入峰值。
- 12 项客户端/解析单测、2 项 Python 服务测试、类型检查和构建通过；隔离 Electron 模拟接口、模型与案例切换、对比记录、保存重开、焦点、浅深色、窄窗口与 EPUB 导入通过。构建保留已有 chunk 大小提示。
- SQLite FTS5 与 LanceDB 图书/索引版本/章节过滤验证已通过；FTS5 原始 trigram 无法命中两字词，已验证字符 bigram 路径。

开发者复现：

```powershell
& ./.cache/library-model-runtime/Scripts/python.exe tests/python/library-models/test_server.py
# 算法对照会额外加载两模型，先关闭其他模型服务再运行
& ./.cache/library-model-runtime/Scripts/python.exe tests/python/library-models/verify_math.py
# 服务启动后运行
node tests/integration/verify-library-models.mjs
# 三模型八案例对比；默认使用专用测试端口 18082。测试现有 18081 服务时先设置：
$env:LIBRARY_TEST_PORT = '18081'
node tests/e2e/verify-library-comparison.mjs
npm.cmd test -- tests/unit/main/smart-library/local-models.test.ts tests/unit/main/smart-library/book-parser.test.ts
npm.cmd run typecheck
npm.cmd run build
node tests/e2e/verify-library-ui.mjs
```

报告位于 `.cache/library-stage0/qwen-gpu-probes.json`，数学对照记录在 `.cache/library-stage0/qwen-math.log`；三模型对比记录在 `.cache/library-stage0/model-comparison.json`，诊断案例源文件为 `src/shared/contracts/library-model-cases.ts`。界面测试使用模拟接口，与真实 GPU 报告分开。

## 样本、清理与验收边界

- 题集为 `tests/fixtures/library/questions.json`：18 题，其中 5 题 holdout；本次额外诊断未使用 holdout 调参。
- 自编 `山灯记.txt` 和生成的 `.cache/library-stage0/山灯记.epub` 可直接导入。
- 用户本地《凡人修仙传》SHA-256：`b9be6472b111017619d2956f2d3be14646c048ca11506c26cd6a145829c42450`；只存短证据锚点，不复制全书进仓库。
- 原 Qwen 社区 Q8 重排文件存在全零词嵌入；F16 + Ollama top-20 概率路径也不能完整评分。现在绕开该路径，使用官方原始权重直接计算分数。
- 按用户要求清理本次下载的低精度 Ollama 向量模型、BGE ONNX 权重及 Node 运行时，移除旧服务脚本。之前 Qwen GGUF 重排测试版本已清理。Ollama 软件及用户原有 qwen3.5 聊天模型保留。
- 这些结果只证明本地接入和有限样本可运行，不代表整书 RAG 的刁钻问题已经解决。
- 2026-09-28 用户明确表示“既然你已经测试了，接下来进入下一阶段吧”，据此允许进入阶段 1；没有将此记录为用户已完成亲测。阶段 1 进展见 `SMART_LIBRARY_STAGE1_ACCEPTANCE.md`。

参考：[Qwen 向量模型](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)、[Qwen 重排模型](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B)。
