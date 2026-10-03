import { readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Reuse production Monaco instead of rebundling its fonts/workers in UI fixtures. */
export async function productionMonaco(out) {
  const assets = await readdir('dist/renderer/assets');
  const runtime = assets.find(name => /^monaco-runtime-.*\.js$/.test(name));
  const css = assets.find(name => /^monaco-runtime-.*\.css$/.test(name));
  if (!runtime || !css) throw Error('Run npm run build before UI verification');
  const assetUrl = name => pathToFileURL(resolve('dist/renderer/assets', name)).href;
  const proxy = resolve(out, 'monaco-proxy.mjs');
  await writeFile(proxy, `import * as runtime from ${JSON.stringify(assetUrl(runtime))}; export const monaco = runtime.monaco ?? Object.values(runtime).find(value => value && typeof value === 'object' && value.monaco)?.monaco;`);
  return { cssUrl: assetUrl(css), plugin: { name: 'production-monaco', setup(build) {
    build.onResolve({ filter: /\/lib\/monaco-runtime$/ }, () => ({ path: pathToFileURL(proxy).href, external: true }));
  } } };
}
