import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await build({ entryPoints: ['src/shared/contracts/library-model-cases.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: '.cache/library-stage0/cases.cjs' });
const { LIBRARY_RERANK_CASES, LIBRARY_RERANKERS } = await import('../../.cache/library-stage0/cases.cjs');
const base = `http://127.0.0.1:${process.env.LIBRARY_TEST_PORT || '18082'}`;
const results = [];
for (const model of LIBRARY_RERANKERS) {
  for (const c of LIBRARY_RERANK_CASES) {
    const start = performance.now();
    const r = await fetch(base + '/rerank', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model.id, query: c.query, documents: c.documents }), signal: AbortSignal.timeout(90000) });
    assert.equal(r.status, 200, `${model.id}/${c.id}: ${await (r.status === 200 ? Promise.resolve('') : r.text())}`);
    const d = await r.json(); assert.equal(d.model, model.id); assert.equal(d.results.length, c.documents.length);
    assert(d.results.every(x => Number.isFinite(x.relevance_score)));
    const ranking = d.results.map(x => x.index);
    const matched = c.preferred.length ? c.preferred.every(i => ranking.slice(0, c.preferred.length).includes(i)) : null;
    results.push({ model: model.id, case: c.id, ranking, matched, elapsedMs: Math.round(performance.now() - start), scores: d.results });
    console.log(model.label, c.id, ranking.join('>'), matched);
  }
  const h = await (await fetch(base + '/health')).json();
  assert.equal(h.rerankerDevice, 'cuda:0');
  assert.equal(h.models[1], model.id);
  assert.equal(h.rerankerDtype, model.precision === 'FP32' ? 'torch.float32' : 'torch.bfloat16');
  console.log('health', JSON.stringify(h));
}
// Switch back after loading both BGE models: ensure reloading Qwen still works.
const r = await fetch(base + '/rerank', { method: 'POST', body: JSON.stringify({ model: LIBRARY_RERANKERS[0].id, query: LIBRARY_RERANK_CASES[0].query, documents: LIBRARY_RERANK_CASES[0].documents }) });
assert.equal(r.status, 200); assert.equal((await r.json()).results[0].index, 1);
await writeFile('.cache/library-stage0/model-comparison.json', JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
// Rankings are measured outcomes, not tests that must all pass to "prove" model quality.
