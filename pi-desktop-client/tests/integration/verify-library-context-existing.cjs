// Manual read-only acceptance against an existing report; writes only .cache.
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { resolve, join } = require('node:path');
const { performance } = require('node:perf_hooks');
const { DatabaseSync } = require('node:sqlite');
const assert = require('node:assert/strict');

(async () => {
  const dataRoot = process.env.PI_LIBRARY_TEST_DATA_ROOT || join(process.env.APPDATA, 'pi-desktop-client', 'modules', 'smart-library');
  const inventory = JSON.parse(await readFile('resources/smart-library/question-bank/candidates.json', 'utf8'));
  const baseline = JSON.parse(await readFile(join(dataRoot, 'evaluation', inventory.source_sha256, 'latest.json'), 'utf8'));
  const row = baseline.report.rows.find(r => r.state === 'completed' && r.hits.length);
  assert(row, 'An existing completed evaluation is required');
  const output = resolve('.cache/library-context-existing', String(Date.now()));
  await mkdir(output, { recursive: true });
  await require('esbuild').build({ entryPoints: { retrieval: 'src/main/smart-library/retrieval/retrieval.ts', scoring: 'src/main/smart-library/evaluation/scoring.ts' }, bundle: true, platform: 'node', format: 'cjs', outdir: output, outExtension: { '.js': '.cjs' }, external: ['@lancedb/lancedb'] });
  const { LibraryRetrieval } = require(join(output, 'retrieval.cjs'));
  const { scoreEvidence } = require(join(output, 'scoring.cjs'));
  const db = new DatabaseSync(join(dataRoot, 'indexes.sqlite'), { readOnly: true });
  try {
    const retrieval = new LibraryRetrieval(db, dataRoot);
    const collect = async locatePage => {
      const started = performance.now(), values = [];
      for (const hit of row.hits.slice(0, 6)) values.push(await retrieval.evidence(baseline.report.book, { version: baseline.report.version, id: hit.id }, { locatePage }));
      return { elapsedMs: performance.now() - started, values };
    };
    const plain = await collect(false);
    const located = await collect(true);
    assert(plain.values.every(e => e.page === undefined && e.locationError === undefined));
    assert(located.values.every(e => typeof e.page === 'number'));
    const spans = plain.values.map((e, i) => {
      const hit = row.hits[i];
      assert.equal(e.text, located.values[i].text);
      assert.deepEqual(e.highlight, located.values[i].highlight);
      assert.equal(e.text.slice(e.highlight.start, e.highlight.end), hit.text);
      const start = hit.start - e.highlight.start;
      return { chapter: hit.chapter, start, end: start + e.text.length };
    });
    const score = scoreEvidence(row.gold, spans);
    assert.equal(score.recall, row.stages.expanded6.recall);
    const report = { passed: true, question: row.id, contextCount: plain.values.length, withoutPageMappingMs: plain.elapsedMs, withColdPageMappingMs: located.elapsedMs, sameTextAndHighlights: true, sameRecall: true };
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
