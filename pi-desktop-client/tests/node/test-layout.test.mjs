import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
async function scan(dir) { return (await readdir(dir, { withFileTypes: true })).flatMap(e => e.isDirectory() ? [dir + '/' + e.name + '/'] : [dir + '/' + e.name]); }
async function walk(dir) { const result = []; for (const p of await scan(dir)) result.push(...(p.endsWith('/') ? await walk(p.slice(0, -1)) : [p])); return result; }
test('test source stays in tests and runners are explicitly separated', async () => {
  for (const dir of ['src', 'scripts']) {
    const misplaced = (await walk(root + dir)).filter(f => /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|\/test[_-].*\.py$|\/verify[-_].*)/.test(f));
    assert.deepEqual(misplaced, [], 'Put tests, fixtures and verification scripts under tests/');
  }
  const config = await readFile(root + 'vitest.config.ts', 'utf8'); assert(config.includes('tests/unit/**/*.test.{ts,tsx}'));
  const pkg = JSON.parse(await readFile(root + 'package.json', 'utf8'));
  assert(pkg.scripts['test:integration']); assert(pkg.scripts['test:node']);
  const service = pkg.build.extraResources.find(item => item.to === 'library-model-service');
  assert(service.filter.includes('server.py')); assert(service.filter.includes('manifest.json'));
  assert(!service.filter.some(f => f.includes('safetensors') || f.includes('test_')));
});
