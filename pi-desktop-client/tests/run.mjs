import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2] || 'all';
const extra = process.argv.slice(3);
async function run(executable, args, env = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, stdio: 'inherit', windowsHide: true, env: { ...process.env, ...env } });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(Error(`测试退出：${code ?? signal}`)));
  });
}
async function unit() { await run(process.execPath, [join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs'), 'run', ...extra]); }
async function node() {
  const files = (await readdir(join(root, 'tests/node'))).filter(f => f.endsWith('.test.mjs')).sort();
  await run(process.execPath, ['--test', ...files.map(f => join(root, 'tests/node', f))]);
}
async function integration() {
  await run(process.execPath, ['scripts/build-main.mjs']);
  const files = ['stage0', 'index', 'storage', 'retention', 'retrieval', 'qa-storage', 'workers', 'strategies'];
  for (const name of extra.length ? extra : files) {
    if (!files.includes(name)) throw Error(`未知的离线集成测试：${name}`);
    await run(require('electron'), [`tests/integration/verify-library-${name}.cjs`], { ELECTRON_RUN_AS_NODE: '1' });
  }
}
async function e2e() {
  const files = ['activity-ui', 'browser-ui', 'chat-ui', 'interview-ui', 'knowledge-ui', 'workspace-theme', 'library-ui', 'library-evaluation-timings', 'library-strategies'];
  for (const name of extra.length ? extra : files) {
    if (!files.includes(name)) throw Error(`未知的界面测试：${name}`);
    await run(process.execPath, [`tests/e2e/verify-${name}.mjs`], { ELECTRON_RUN_AS_NODE: '' });
  }
}
async function python() {
  const exe = process.env.PI_LIBRARY_PYTHON || 'python';
  await run(exe, ['-m', 'unittest', 'discover', '-s', 'tests/python/library-models', '-p', 'test_*.py']);
  await run(exe, ['-m', 'unittest', 'discover', '-s', 'tests/python/question-bank', '-p', 'test_*.py']);
}
try {
  if (mode === 'all') { await unit(); await node(); }
  else if (mode === 'unit') await unit();
  else if (mode === 'node') await node();
  else if (mode === 'integration') await integration();
  else if (mode === 'e2e') await e2e();
  else if (mode === 'python') await python();
  else throw Error(`未知测试分类：${mode}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
