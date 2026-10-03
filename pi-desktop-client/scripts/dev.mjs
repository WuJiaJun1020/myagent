import { context } from 'esbuild';
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { mainBuildOptions } from './main-build-options.mjs';
import { DevElectron } from './dev-electron.mjs';

let server, builder, electron, input;
let closing = false;
let building = false;
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  input?.close();
  await electron?.stop();
  await builder?.dispose();
  await server?.close();
  process.exitCode = code;
}
async function compileAndRestart() {
  if (closing) return;
  if (building) {
    console.log('[dev] 正在编译或重启，请稍候');
    return;
  }
  building = true;
  try {
    console.log('[dev] 正在编译后端…');
    try { await builder.rebuild(); }
    catch {
      if (!closing) console.error('[dev] 编译失败，保留现有窗口；修复后输入 r 重试');
      return;
    }
    if (closing) return;
    console.log('[dev] 后端编译完成');
    await electron.restart();
  } catch (error) {
    console.error(error);
    await shutdown(1);
  } finally { building = false; }
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
try {
  server = await createServer({ server: { host: '127.0.0.1' } });
  try { await server.listen(); }
  catch (error) {
    if (error.code !== 'EACCES') throw error;
    await server.close();
    console.warn('[dev] 默认端口不可用，改用系统分配的空闲端口');
    server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
  }
  const url = server.resolvedUrls?.local[0];
  if (!url) throw Error('无法获取 Vite 开发地址');
  const env = { ...process.env, PI_CLIENT_DEV_URL: url, PI_CLIENT_DEV_MANAGED: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  electron = new DevElectron({ executable: createRequire(import.meta.url)('electron'), args: ['.'], env,
    onExit: code => {
      if (code === 0) void shutdown();
      else console.error('[dev] Electron 已异常退出，修复代码后输入 r 重试');
    },
  });
  // Keep the incremental build cache, but never watch backend files.
  builder = await context(mainBuildOptions);
  console.log(`[dev] Vite: ${url}\n[dev] 后端保存不编译；输入 r 回车编译并重启，Ctrl+C 退出。`);
  input = createInterface({ input: process.stdin });
  input.on('line', line => {
    if (line.trim().toLowerCase() !== 'r') return;
    void compileAndRestart();
  });
  await compileAndRestart();
} catch (error) {
  console.error('[dev] 启动失败', error);
  await shutdown(1);
}
