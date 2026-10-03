// Manual GPU acceptance: simulate ASAR plus packaged resources, without building an installer.
import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { resolveLibraryModelPaths } from '../../src/platform/main/runtime/library-model-paths.mjs';
const require = createRequire(import.meta.url);
const root = resolve('.cache/library-packaged-models/安装 目录-' + Date.now());
const dataRoot = join(root, 'user-data'), resourcesPath = join(root, 'resources');
await mkdir(join(resourcesPath, 'library-model-service'), { recursive: true });
await mkdir(dataRoot, { recursive: true });
const external = await resolveLibraryModelPaths({ appRoot: resolve('.'), dataRoot: join(root, 'unused-development-config') });
await writeFile(join(dataRoot, 'model-runtime.json'), JSON.stringify({ pythonExe: external.pythonExe, modelsDirectory: external.modelsDirectory }));
for (const name of ['server.py', 'manifest.json']) await copyFile(resolve('scripts/library-models', name), join(resourcesPath, 'library-model-service', name));
await build({ entryPoints: ['src/main/smart-library/model-runtime.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: join(root, 'runtime.cjs') });
const { LibraryModelRuntime } = require(join(root, 'runtime.cjs'));
const port = 18087;
const runtime = new LibraryModelRuntime(join(root, 'app.asar'), async () => true, port, { packaged: true, dataRoot, resourcesPath });
try {
  let status = await runtime.action('start'); assert(status.owned, 'Acceptance port must not be owned by another service');
  const deadline = Date.now() + 180000;
  while (status.state !== 'ready' && Date.now() < deadline) {
    assert.notEqual(status.state, 'failed', status.error + '\n' + status.log);
    await new Promise(r => setTimeout(r, 1000)); status = await runtime.status();
  }
  assert.equal(status.state, 'ready', JSON.stringify(status));
  console.log('Packaged resource service ready on GPU:', status.gpu);
  const response = await fetch(`http://127.0.0.1:${port}/api/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'Qwen/Qwen3-Embedding-0.6B', input: ['原文定位验证'], truncate: false }), signal: AbortSignal.timeout(30000) });
  assert(response.ok); const result = await response.json(); assert.equal(result.embeddings[0].length, 1024);
  await runtime.action('stop'); assert.equal((await runtime.status()).state, 'stopped');
  console.log('PASS packaged layout: external Python/weights, resource script, paths with spaces, CUDA embedding and shutdown');
} finally { await runtime.dispose(); }
