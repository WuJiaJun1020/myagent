import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
const MODEL = 'Qwen/Qwen3-Reranker-0.6B';
const cases = [
  { query: '林舟把铜钥匙交给了谁？', documents: ['山顶下起了小雨，众人回屋休息。', '林舟把铜钥匙交给了苏禾，请她保管。'], expected: 1 },
  { query: '为什么船没有按原定时间出发？', documents: ['码头边种着两棵树。', '船长把新船涂成了蓝色。', '原定周二启航，但突发洪水封航，只能推迟。'], expected: 2 },
  { query: '谁负责保存钥匙？', documents: ['阿宁收下钥匙，答应替大家妥善保管。', '阿宁走到窗边欣赏雨景。'], expected: 0 },
  { query: 'What is the capital of China?', documents: ['The capital of China is Beijing.', 'Gravity attracts objects toward each other.'], expected: 0 },
];
async function call(body) {
  const start = performance.now();
  const r = await fetch('http://127.0.0.1:18081/rerank', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  return { status: r.status, data: await r.json(), elapsedMs: Math.round(performance.now() - start) };
}
const report = { model: MODEL, date: new Date().toISOString(), cases: [] };
for (const c of cases) {
  const r = await call({ model: MODEL, query: c.query, documents: c.documents });
  assert.equal(r.status, 200); assert.equal(r.data.results[0].index, c.expected);
  assert(r.data.results.every(x => Number.isFinite(x.relevance_score) && x.relevance_score >= 0 && x.relevance_score <= 1));
  report.cases.push({ query: c.query, ...r });
}
const reversed = await call({ model: MODEL, query: cases[0].query, documents: [...cases[0].documents].reverse() });
assert.equal(reversed.data.results[0].index, 0);
assert(Math.abs(reversed.data.results[0].relevance_score - report.cases[0].data.results[0].relevance_score) < 1e-6);
assert.equal((await call({ model: MODEL, query: '钥匙', documents: ['钥匙'.repeat(8000)] })).status, 422);
assert.equal((await call({ model: 'wrong', query: '钥匙', documents: ['钥匙'] })).status, 400);
await build({ entryPoints: ['src/main/smart-library/local-models.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: '.cache/library-stage0/model-service.cjs' });
const { LibraryLocalModelService } = await import('../../.cache/library-stage0/model-service.cjs');
const service = new LibraryLocalModelService('.cache/library-stage0/fresh-config');
try {
  report.clientEmbedding = await service.probe('embedding', await service.get());
  report.clientReranker = await service.probe('reranker', await service.get());
  assert.deepEqual(report.clientReranker.ranking, [1, 0]);
} finally { await service.dispose(); }
report.health = await (await fetch('http://127.0.0.1:18081/health')).json();
assert.equal(report.health.device, 'cuda:0');
assert.equal(report.health.rerankerDevice, 'cuda:0');
assert.equal(report.health.dtype, 'torch.bfloat16');
assert.equal(report.health.rerankerDtype, 'torch.bfloat16');
report.passed = true;
await mkdir('.cache/library-stage0', { recursive: true });
await writeFile('.cache/library-stage0/qwen-gpu-probes.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
