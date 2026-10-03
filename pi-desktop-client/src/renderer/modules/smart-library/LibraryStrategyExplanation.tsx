import { ArrowDown } from "lucide-react";
import type { ReactNode } from "react";
import type { LibraryStrategyProfile } from "../../../shared/contracts/library-strategy";

const count = (value: number) => Number.isFinite(value) ? value.toLocaleString("zh-CN") : "待填写";
const reasoning = (value?: string) => value ? ({ minimal: "最少", low: "低", medium: "中", high: "高", xhigh: "超高", max: "最大" } as Record<string, string>)[value] ?? value : "沿用本轮回答的思考程度";

function Flow({ label, steps }: { label: string; steps: ReactNode[] }) {
  return <figure className="library-strategy-flow" aria-label={label}>
    <figcaption>{label}</figcaption>
    <ol>{steps.map((step, index) => <li key={index}><div className="library-strategy-flow-node">{step}</div>{index < steps.length - 1 && <ArrowDown size={18} aria-hidden="true"/>}</li>)}</ol>
  </figure>;
}

function Detail({ title, children }: { title: string; children: ReactNode }) {
  return <section className="library-strategy-explanation-detail"><h3>{title}</h3>{children}</section>;
}

export function LibraryStrategyExplanation({ profile: p, dirty, onDescriptionChange }: {
  profile: LibraryStrategyProfile;
  dirty: boolean;
  onDescriptionChange: (value: string) => void;
}) {
  const planning = !!p.queryPlanning?.enabled;
  const keyword = p.retrieval.mode !== "vector", vector = p.retrieval.mode !== "keyword";
  const hybrid = keyword && vector;
  const rewriteMode = p.rewrite.mode === "off" ? "不改写，直接使用原问题" : p.rewrite.mode === "always" ? "每次调用模型改写问题" : "仅有符合条件的历史时改写问题";
  const processing = planning ? `检索规划 · 最多 ${count(p.queryPlanning!.maxSubqueries)} 个子问题` : rewriteMode;
  const steps: ReactNode[] = [
    <><strong>问题与会话历史</strong><span>当前问题＋最近至多 {count(p.answer.historyRounds)} 轮有效历史</span></>,
    <><strong>{processing}</strong><span>{planning ? "保留原问题；子问题独立检索，简单问题可只走原问题" : p.rewrite.mode === "off" ? "不调用问题处理模型" : "补齐指代与省略；不生成书中事实或答案"}</span></>,
    <><strong>{planning ? "每条查询分别召回" : "单条查询召回"}</strong><div className="library-strategy-flow-branches">
      {keyword && <div><strong>关键词</strong><span>SQLite 全文检索 · 最多 {count(p.retrieval.keywordCandidates)} 个候选</span></div>}
      {vector && <div><strong>语义向量</strong><span>本地向量模型＋LanceDB · 最多 {count(p.retrieval.vectorCandidates)} 个候选</span></div>}
    </div></>,
    <><strong>{planning ? "按查询路线分配候选" : hybrid ? "RRF 排名融合与筛选" : "候选筛选"}</strong><span>{planning ? `${hybrid ? "每路 RRF 融合；" : ""}预留各路候选、去重，共保留最多 ${count(p.retrieval.fusionCandidates)} 个` : `去重设置：${p.context.deduplicate ? "过滤高度重叠" : "保留重叠片段"}；最多 ${count(p.retrieval.fusionCandidates)} 个候选`}</span></>,
    <><strong>{p.retrieval.rerank ? planning ? "各路分别重排，再轮流取证据" : "本地模型重排" : planning ? "按各路召回排名轮流取证据" : "沿用召回排名"}</strong><span>{p.retrieval.rerank ? `推理批量 ${count(p.retrieval.batchSize)}；` : "重排已关闭；"}返回最多 {count(p.retrieval.returnedChunks)} 个片段</span></>,
    <><strong>{planning && p.context.deduplicate ? "扩展原文并合并相邻证据" : "扩展原文，组装回答上下文"}</strong><span>前后各扩展最多 {count(p.context.expandChars)} 字符；最多 {count(p.context.chunks)} 份引用、{count(p.context.maxChars)} 字符</span></>,
    <><strong>图书回答与引用</strong><span>问题＋必要历史＋本轮原文证据 → 回答模型 → 带引用的回答</span><small>召回评测在上一步结束，不执行回答生成。</small></>,
  ];

  return <div className="library-strategy-explanation">
    <div className="library-strategy-explanation-heading"><h3>{p.name}</h3><p>{planning ? "传统 RAG · 多路证据覆盖" : "传统 RAG · 单次检索"} · {dirty ? "按当前草稿说明，保存后才用于运行" : `已保存配置 v${p.revision}`}</p></div>
    <label>方案简介<textarea aria-label="方案说明" rows={2} maxLength={500} value={p.description} onChange={e => onDescriptionChange(e.target.value)}/></label>
    <Flow label="每轮问答流程" steps={steps}/>

    <Detail title="1. 图书如何建立索引">
      <p>从导入图书的原文解析章节，在每个章节内部切片，不把不同章节拼成同一片段。当前采用{p.chunking.method === "paragraph" ? "标点与段落边界切片：在目标长度后半段寻找最后一个换行或句末标点，尽量避免把句子截断；找不到合适边界时按长度截断" : "固定长度切片：按设定的字符长度截断，结尾片段可以更短"}。</p>
      <p>目标长度 {count(p.chunking.size)} 字符，相邻片段重叠最多 {count(p.chunking.overlap)} 字符。重叠让边界附近的事实有机会被两个片段保留。字符按 UTF-16 计数，原文坐标用于引用核对与跳转。</p>
      <div className="library-strategy-build-flow" role="img" aria-label="建库流程：解析章节，按配置切片，生成关键词与向量索引"><span>原书与章节</span><ArrowDown size={16} aria-hidden="true"/><span>切片与原文坐标</span><ArrowDown size={16} aria-hidden="true"/><span>关键词索引＋本地向量索引</span></div>
      <p>原文、片段与关键词索引保存在 SQLite，向量保存在 LanceDB。各方案独立建库；原书与模型权重可共用，每套方案保留一份当前有效索引。建库会生成两种索引，查询时只使用所选检索方式。</p>
    </Detail>
    <Detail title={planning ? "2. 如何拆分检索问题" : "2. 如何处理问题与记忆"}>
      {planning ? <><p>每次先调用问题处理模型，将多事实、多个时间阶段或因果链问题拆成最多 {count(p.queryPlanning!.maxSubqueries)} 个可独立检索的子问题。原问题始终保留，最多形成 {count(p.queryPlanning!.maxSubqueries + 1)} 条查询路线。</p><p>历史用于补齐人物或事件指代；模型不能猜测书籍事实、人物名称或章节位置。简单问题可以返回空数组，但仍使用本方案的候选分配与上下文合并规则。启用检索规划后，不再额外执行单问题改写。</p></> : <><p>当前设置：{rewriteMode}。改写用于把“他后来去了哪里”补成带有明确人物的检索问题，不负责回答问题。关闭改写时直接检索原问题；仅历史模式在没有有效历史时也直接检索。</p><p>改写返回一条检索问题，所以一次检索只有一个查询入口。需要分散在多个章节的证据时，单条查询的前排结果可能集中于同一事件，漏掉其他要点。</p></>}
      <p>最近至多 {count(p.answer.historyRounds)} 轮历史参与理解问题，只使用已完成、无错误且索引版本相同的记录。过去答案只用于消除指代，本轮书籍事实必须重新检索。检索页码范围属于会话设置，默认全书；改变范围不清空记忆，原文扩展也不会超出本轮范围。</p>
      <p>问题处理模型：{p.rewrite.model ? `${p.rewrite.model.providerId} / ${p.rewrite.model.modelId}` : "沿用本轮回答模型"}；思考程度：{reasoning(p.rewrite.reasoning)}。规划或改写与图书回答是独立模型请求，只通过应用明确传入的历史关联；规划/改写不接收整本书或检索证据。</p>
    </Detail>
    <Detail title="3. 如何召回与分配候选">
      <p>当前方式：{hybrid ? "关键词＋向量混合检索" : keyword ? "仅关键词检索" : "仅向量检索"}。{planning ? "下面的候选数量均指每条查询；总候选池另有上限。" : "下面的候选数量指这一条检索问题。"}</p>
      {keyword && <p>关键词最多 {count(p.retrieval.keywordCandidates)} 个：对中文查询提取相邻字词，使用 SQLite 全文检索与 BM25 排序，并优先保留包含完整查询的片段。适合人物名、物品名和具体措辞；表述差异较大时可能遗漏。</p>}
      {vector && <p>向量最多 {count(p.retrieval.vectorCandidates)} 个：使用 {p.localModels.embeddingModel} 将查询向量化，再与本方案的图书片段向量按余弦距离检索。适合同义表达与语义关联；查询模型、权重版本与维度必须和建库一致。</p>}
      {hybrid ? <p>RRF 按排名融合两路结果，不直接比较关键词分数与向量距离。同一片段在每路的贡献为 <code>1 / ({count(p.retrieval.rrfK)} + 排名)</code>，贡献相加后排序；两路都靠前的片段通常更容易入选。</p> : <p>当前只使用一路召回，不进行关键词与向量的两路排名融合。</p>}
      <p>{planning ? `各路先${hybrid ? "融合两路排名" : "整理当前召回排名"}，再预留启用的召回来源中靠前的候选，按查询路线轮流补齐，避免某一路占满总候选池。同一片段只保留一次，共保留最多 ${count(p.retrieval.fusionCandidates)} 个；一个片段可记录多条命中路线，但只归属一路重排。路线按顺序执行。` : `按召回排名筛选最多 ${count(p.retrieval.fusionCandidates)} 个候选，交给后续重排。`}</p>
      <p>高度重叠过滤{p.context.deduplicate ? "已启用：同章节两个片段的重叠长度超过较短片段的 60% 时，避免重复占用候选或返回名额" : "已关闭：允许高度重叠的不同片段同时返回"}。</p>
    </Detail>
    <Detail title="4. 如何重排并返回片段">
      {p.retrieval.rerank ? <><p>当前使用本地重排模型 {p.localModels.rerankerModel}，让模型同时读取检索问题与候选原文，给相关性评分。重排可以改善候选的先后顺序，无法找回已经被召回或候选截断遗漏的原文。</p><p>GPU 推理批量为 {count(p.retrieval.batchSize)}。一次批量计算多个“问题＋原文”对，尾批按实际数量处理，不要求候选数是批量的整数倍；外部接口是否支持该参数取决于服务实现。</p>{p.localModels.rerankerModel === "BAAI/bge-reranker-base" && <p>BGE Base 会把每个候选拆为覆盖全文的短窗口，按该片段最高窗口分数排序；耗时与窗口数量有关。</p>}</> : <p>重排已关闭，不调用重排模型，保留召回阶段的排名。</p>}
      <p>{planning ? "各查询路线分别排序，再按路线轮流选片段；子问题路线优先，随后轮到原问题。不同路线的重排分数不直接比较，以各路自己的排名分配名额。" : "按这一条查询的排名，从前往后选择片段。"}最多返回 {count(p.retrieval.returnedChunks)} 个片段；结果不足时按实际数量返回。</p>
    </Detail>
    <Detail title="5. 哪些原文真正进入回答上下文">
      <p>返回片段不等于全部进入回答模型。每片在同章节前后各补充最多 {count(p.context.expandChars)} 字符，补足人物指代、上下句和事件背景，仍遵守会话检索范围与章节边界。</p>
      <p>{planning ? p.context.deduplicate ? "扩展后的原文如果在同章节相接或重叠，就合并为一份引用，并记录全部源片段。最多保留" : "相邻原文合并已关闭，各片独立作为引用。最多保留" : "按返回排名依次读取前面的片段，最多保留"} {count(p.context.chunks)} 份证据，总原文预算 {count(p.context.maxChars)} 字符。{planning ? "超预算的候选跳过，继续尝试后续较短的片段；达到引用数上限后，仍可尝试合并已有证据。" : "遇到下一片会超出预算时停止加入后续片段。"}这些限制可能让返回片段中的部分证据最终未进入回答。</p>
      <p>这里的字符预算仅指原文证据，不等于模型上下文 token 上限；系统提示词、问题与历史也会占用模型上下文。</p>
    </Detail>
    <Detail title="6. 回答模型实际会看到什么">
      <p>应用把固定系统规则、当前问题、必要会话历史、检索范围、编号原文证据，以及配置的附加回答提示词组装成新请求。模型默认配置为 {p.answer.model ? `${p.answer.model.providerId} / ${p.answer.model.modelId}` : "客户端默认／问答当前选择"}；最终以问答输入框当前可见的模型和思考程度为准。</p>
      <p>回答只能依据本轮原文事实，每项有依据的结论标注 [1]、[2] 等引用。证据不足应说明缺少什么，不能把“没检索到”当作“全书不存在”，也不能把历史答案当作新证据。应用会校验引用编号是否存在；编号校验通过仍需要人工核对结论与原文。</p>
      <p>向量化、重排与检索在本地。规划/改写请求只发送问题与必要历史；回答请求会把问题、必要历史及少量检索原文发给输入框选择的模型服务。每轮“调试信息”可查看实际系统提示词、消息、原文、模型返回、token 用量与检索过程，缓存命中率取决于实际请求和服务返回。</p>
    </Detail>
    <Detail title="7. 如何比较效果与修改参数">
      <p>召回评测复用问题处理、召回、重排和上下文组装，执行到原文证据准备完成为止，不生成最终回答。每题独立、无历史、全书范围，所以“仅有历史时改写”在评测中不会调用改写模型；检索规划与“每次改写”会执行模型请求。</p>
      <p>问答遇到规划、向量或重排故障可能带提示降级；评测中降级的题标为失败，不把回退结果当作当前方案的完整表现。对比同一题集的分难度召回、全部证据找齐题数与耗时；召回率表示证据覆盖，不等于答案正确率。候选数、返回量和原文预算不同的方案，也不是相同计算量的对照。</p>
      <p>{planning ? "多路规划面向跨章节、多事实和多阶段问题，会增加一次模型请求和多路检索开销。问题拆错、候选池不足或上下文预算过小，仍可能漏证据。关闭规划不仅取消拆分，也回到单查询的候选筛选与上下文组装规则。" : "单次检索流程较短，适合直接事实问题；面对跨章节证据链，增加候选或上下文预算可能有帮助，也会增加重排与输入开销。"}</p>
      <p>修改切片方式、长度、重叠或向量接口/模型后，需要重建当前方案索引。修改召回数量、重排、问题处理、上下文预算与回答设置，保存后用于下一次执行，无需重建。现有报告与回答仍记录当时配置。</p>
    </Detail>
  </div>;
}
