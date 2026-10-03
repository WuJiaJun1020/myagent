import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const child = spawn(createRequire(import.meta.url)('electron'), ['tests/integration/verify-library-qa-real.cjs'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit', windowsHide: true,
});
child.once('error', error => { console.error(error); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
