import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { resolveLibraryModelPaths } from "../../../../../src/platform/main/runtime/library-model-paths.mjs";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function file(path: string) { await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, "fixture"); }
async function fixture(packaged = false) {
  const root = await mkdtemp(join(tmpdir(), "pi-library-paths-")); roots.push(root);
  const options = { appRoot: join(root, "app"), dataRoot: join(root, "data"), resourcesPath: join(root, "resources"), packaged, env: {}, platform: "win32" as const };
  const python = packaged ? join(options.dataRoot, "runtime/python/Scripts/python.exe") : join(options.appRoot, ".cache/library-model-runtime/Scripts/python.exe");
  const models = packaged ? join(options.dataRoot, "models") : join(options.appRoot, "models/smart-library");
  const script = packaged ? join(options.resourcesPath, "library-model-service/server.py") : join(options.appRoot, "scripts/library-models/server.py");
  await file(python); await file(script);
  for (const model of ["Qwen3-Embedding-0.6B", "Qwen3-Reranker-0.6B"]) await file(join(models, model, "config.json"));
  return { root, options, python, models, script };
}
it("preserves existing development Python and weights", async () => {
  const f = await fixture(); expect(await resolveLibraryModelPaths(f.options)).toMatchObject({ pythonExe: f.python, serverScript: f.script, modelsDirectory: f.models });
});
it("uses packaged resources and external data even when the app is inside ASAR", async () => {
  const f = await fixture(true); f.options.appRoot = join(f.root, "app.asar");
  expect(await resolveLibraryModelPaths(f.options)).toMatchObject({ pythonExe: f.python, serverScript: f.script, modelsDirectory: f.models });
});
it("accepts configured absolute paths with spaces and gives environment overrides priority", async () => {
  const f = await fixture(true), pythonExe = join(f.root, "外部 Python", "python.exe"), modelsDirectory = join(f.root, "模型 权重");
  await file(pythonExe);
  for (const model of ["Qwen3-Embedding-0.6B", "Qwen3-Reranker-0.6B"]) await file(join(modelsDirectory, model, "config.json"));
  await writeFile(join(f.options.dataRoot, "model-runtime.json"), JSON.stringify({ pythonExe, modelsDirectory }));
  expect(await resolveLibraryModelPaths(f.options)).toMatchObject({ pythonExe, modelsDirectory });
  expect(await resolveLibraryModelPaths({ ...f.options, env: { PI_LIBRARY_PYTHON: f.python, PI_LIBRARY_MODELS: f.models } })).toMatchObject({ pythonExe: f.python, modelsDirectory: f.models });
});
it("reports missing resources, malformed configuration and relative paths clearly", async () => {
  const f = await fixture(true);
  await rm(f.script); await expect(resolveLibraryModelPaths(f.options)).rejects.toThrow("服务脚本缺失"); await file(f.script);
  await writeFile(join(f.options.dataRoot, "model-runtime.json"), "broken"); await expect(resolveLibraryModelPaths(f.options)).rejects.toThrow("配置无效");
  await writeFile(join(f.options.dataRoot, "model-runtime.json"), JSON.stringify({ pythonExe: "relative.exe" }));
  await expect(resolveLibraryModelPaths(f.options)).rejects.toThrow("绝对路径");
});
