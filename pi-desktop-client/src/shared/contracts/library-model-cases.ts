// Original diagnostic examples, separate from the held-out book evaluation set.
export const LIBRARY_RERANKERS = [
  { id: "Qwen/Qwen3-Reranker-0.6B", label: "千问 0.6B", precision: "BF16", limit: 4096 },
  { id: "BAAI/bge-reranker-base", label: "BGE Base", precision: "FP32", limit: 512 },
  { id: "BAAI/bge-reranker-v2-m3", label: "BGE v2 M3", precision: "FP32", limit: 4096 },
];
export type LibraryRerankCase = { id: string; title: string; query: string; documents: string[]; preferred: number[]; explanation: string };
export const LIBRARY_RERANK_CASES: LibraryRerankCase[] = [
  { id: "direct", title: "直接证据 · 人名归属", query: "林舟把铜钥匙交给了谁？", documents: ["山顶下起了小雨，众人回屋休息。", "林舟把铜钥匙交给了苏禾，请她保管。"], preferred: [1], explanation: "原文②直接说明铜钥匙的接收者。重排只排序原文，不生成答案。" },
  { id: "paraphrase", title: "同义改写 · 保管职责", query: "谁负责保存钥匙？", documents: ["阿宁收下钥匙，答应替大家妥善保管。", "阿宁走到窗边欣赏雨景。", "钥匙的形状像一片柳叶，表面刻着花纹。"], preferred: [0], explanation: "原文①用‘收下、妥善保管’表达保存职责；③只描述外形。" },
  { id: "cause", title: "因果关系 · 相似干扰", query: "为什么船没有按原定时间出发？", documents: ["船长把新船涂成蓝色，准备周二启航。", "原定周二启航，但突发洪水封航，只能推迟。", "船靠岸后，船长因为疲惫而休息。"], preferred: [1], explanation: "原文②提供延期原因；③的因果发生在靠岸后。" },
  { id: "time", title: "时间限定 · 状态变化", query: "三月七日晚上，铜钥匙由谁保管？", documents: ["三月三日，林舟将铜钥匙交给苏禾保存。", "三月七日下午，苏禾将铜钥匙交还林舟；当天晚上钥匙一直由林舟保管。", "三月七日晚上，苏禾在码头等船，周远保管着仓库的铁钥匙。"], preferred: [1], explanation: "优先考虑与提问时点一致的状态；不要混淆铜钥匙和铁钥匙。" },
  { id: "negative", title: "否定与条件", query: "暴雨期间，哪些人可以进入药库？", documents: ["平时所有登记过的村民都能进入药库。", "暴雨期间，只有持红色通行证的医师可以进入药库；普通村民不得进入。", "持红色通行证的船工可以进入码头仓库。"], preferred: [1], explanation: "原文②同时满足时间、地点和身份条件；①是平时规则，③是另一地点。" },
  { id: "alias", title: "别名与指代", query: "阿禾把账本放在哪里？", documents: ["苏禾，大家叫她阿禾。她收好账本，将它放进书房的木箱。", "苏禾把雨伞放在门口。", "周禾将自己的账本藏在船舱。"], preferred: [0], explanation: "原文①包含别名对应和账本位置；③只有相似人名。" },
  { id: "multi", title: "多段证据 · 需要联合查证", query: "谁委托陈渡送药，药最终送到哪里？", documents: ["苏禾委托陈渡运送这批药，要求尽快出发。", "陈渡将这批药送到青石村诊所，完成了运送。", "周远曾在青石村诊所看病，但没有参与运药。"], preferred: [0, 1], explanation: "①和②各回答一半，应优先保留两段，二者先后不限。单条重排不能代替多段推理。" },
  { id: "absent", title: "无答案 · 不应强行选答案", query: "苏禾出生于哪一年？", documents: ["苏禾于二〇一八年搬到村里，之后在药铺工作。", "苏禾喜欢在春天整理账本，从未向大家提起年龄。", "二〇〇一年，村里的药铺正式开张。"], preferred: [], explanation: "所有候选都没有出生年份。仍会有排名第一的段落，但第一名不等于存在答案；此题不计算首位命中。" },
];
