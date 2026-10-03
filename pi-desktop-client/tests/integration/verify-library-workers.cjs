// Exercise the shared client through real worker threads, using only isolated data.
const { build } = require('esbuild');
const { mkdir, copyFile, writeFile } = require('node:fs/promises');
const { resolve, join } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve('.cache/library-workers/' + Date.now());
(async () => {
  await mkdir(root, { recursive: true });
  await build({ entryPoints: ['tests/helpers/worker-services.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: join(root, 'services.cjs') });
  for (const name of ['library-index', 'library-question-bank']) await copyFile(resolve('dist/main/' + name + '.cjs'), join(root, name + '.cjs'));
  const { LibraryIndexService, LibraryQuestionBankService } = require(join(root, 'services.cjs'));
  const indexes = new LibraryIndexService(join(root, 'data')), bank = new LibraryQuestionBankService(join(root, 'data'));
  const book = 'a'.repeat(64);
  try {
    assert.equal(await indexes.isBusy(), false);
    assert.equal((await indexes.request(book, 'status')).state, 'empty');
    assert.equal(await indexes.isBusy(), false);
    const session = (await indexes.request(book, 'qa-sessions', undefined, undefined, { action: 'create' }))[0];
    assert(session.id);
    await indexes.request(book, 'qa-sessions', undefined, undefined, { action: 'rename', sessionId: session.id, title: '通信验证' });
    assert.equal((await indexes.request(book, 'qa-sessions', undefined, undefined, { action: 'list' }))[0].title, '通信验证');
    assert.deepEqual((await bank.list(book)).entries, []);
    assert.deepEqual(await bank.published(book), []);
    await assert.rejects(bank.evidence(book, 'missing', 'missing'), /没有这道题/);
    assert.deepEqual((await bank.list(book)).entries, []);
    await assert.rejects(indexes.request('../invalid', 'status'), /ID/);
  } finally { await Promise.all([indexes.dispose(), bank.dispose()]); }
  await assert.rejects(indexes.request(book, 'status'), /关闭/);
  console.log('PASS typed clients: real worker replies, sessions, bank protocol, business errors and disposal');
})().catch(error => { console.error(error); process.exitCode = 1; });
