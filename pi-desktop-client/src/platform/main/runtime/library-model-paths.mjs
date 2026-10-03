import { access, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

/** Shared by Electron and the CLI; importing this file performs no I/O. */
export async function resolveLibraryModelPaths({ appRoot, dataRoot, packaged = false, resourcesPath, env = process.env, platform = process.platform }) {
  const configFile = join(dataRoot, 'model-runtime.json');
  let config = {};
  try {
    config = JSON.parse(await readFile(configFile, 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('配置必须是对象');
  } catch (error) {
    if (error.code !== 'ENOENT') throw Error(`模型运行路径配置无效：${configFile}（${error.message}）`);
  }
  const defaultEnvironment = packaged ? join(dataRoot, 'runtime', 'python') : join(appRoot, '.cache', 'library-model-runtime');
  const pythonExe = env.PI_LIBRARY_PYTHON || config.pythonExe || join(defaultEnvironment, ...(platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
  const modelsDirectory = env.PI_LIBRARY_MODELS || config.modelsDirectory || (packaged ? join(dataRoot, 'models') : join(appRoot, 'models', 'smart-library'));
  const serverScript = packaged ? join(resourcesPath || '', 'library-model-service', 'server.py') : join(appRoot, 'scripts', 'library-models', 'server.py');
  if (packaged && !resourcesPath) throw Error('安装版模型服务缺少资源目录');
  for (const [label, value] of [['Python', pythonExe], ['模型权重', modelsDirectory]]) {
    if (typeof value !== 'string' || !isAbsolute(value)) throw Error(`${label}路径必须为绝对路径，请检查 ${configFile}`);
  }
  for (const [label, file] of [['Python', pythonExe], ['服务脚本', serverScript], ['向量权重', join(modelsDirectory, 'Qwen3-Embedding-0.6B', 'config.json')], ['重排权重', join(modelsDirectory, 'Qwen3-Reranker-0.6B', 'config.json')]]) {
    try { await access(file); }
    catch { throw Error(`未找到本地 GPU 模型环境：${label}缺失（${file}）。可在 ${configFile} 设置 pythonExe、modelsDirectory，或设置 PI_LIBRARY_PYTHON、PI_LIBRARY_MODELS。`); }
  }
  return { pythonExe, serverScript, modelsDirectory, workingDirectory: modelsDirectory };
}
