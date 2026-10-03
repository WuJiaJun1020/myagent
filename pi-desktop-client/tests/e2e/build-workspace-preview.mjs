import { build } from "esbuild";
import { readFile, writeFile, mkdtemp, rm, rmdir, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const directory = await mkdtemp(join(tmpdir(), "pi-workspace-preview-"));
try {
  const bundle = join(directory, "preview.cjs");
  await build({ entryPoints: ["tests/e2e/workspace-preview.tsx"], outfile: bundle, bundle: true, platform: "node", format: "cjs", jsx: "automatic", logLevel: "silent" });
  const { renderPreview, workspaceThemeCss } = createRequire(import.meta.url)(bundle);
  const styles = await Promise.all(["styles.css", "styles/workspace-shell.css", "styles/conversation.css", "styles/workspace-surfaces.css", "styles/workspace-tokens.css", "styles/overlays.css"].map(file => readFile(`src/renderer/${file}`, "utf8")));
  const html = `<!doctype html><html lang="zh-CN" data-workspace="agent" data-theme="light" data-palette="gray" data-accent="theme"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent 工作区设计样板</title><style>${workspaceThemeCss()}
${styles.join("\n").replace('@import "tailwindcss";', '')}
  body { min-width:0; min-height:0; overflow:auto; font:14px/1.5 system-ui,sans-serif; }
  :where(button) { cursor:pointer; border:0; background:transparent; } .preview-controls { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:12px 20px; background:var(--bg-sidebar); border-bottom:1px solid var(--border); }
  .preview-controls button { padding:6px 10px; color:var(--text); background:var(--bg-panel); border:1px solid var(--border); border-radius:8px; }
  .preview-controls span { color:var(--text-muted); font-size:12px; }
  .preview-app { display:grid; grid-template-columns:220px minmax(0,1fr); height:calc(100vh - 65px); min-height:620px; margin:auto; }
  .preview-main { display:flex; flex-direction:column; min-width:0; min-height:0; }.preview-main > .topbar { min-height:52px; }
  .preview-columns { display:flex; flex:1; min-height:0; }.preview-conversation { display:flex; flex-direction:column; flex:1; min-width:0; }
  .preview-review { display:none; width:340px; padding:20px; border-left:1px solid var(--border); background:var(--bg-panel); }.preview-review header { font-weight:600; }.preview-review small { display:block; font-weight:400; color:var(--text-muted); }.preview-review pre { overflow:auto; font-family:var(--font-code); }.preview-diff-add { color:var(--green); }
  .preview-settings { display:none; width:100%; overflow:auto; }.preview-settings p { color:var(--text-soft); }
  .preview-surfaces { display:none; min-height:0; padding:24px; overflow:auto; }.preview-surfaces > .code-editor { min-height:310px; border:1px solid var(--border); border-radius:10px; }.preview-surfaces textarea { min-height:170px; }
  html[data-preview="review"] .preview-review { display:block; }
  html[data-preview^="settings"] .preview-columns, html[data-preview^="surface"] .preview-columns { display:none; }
  html[data-preview^="settings"] .preview-settings, html[data-preview^="surface"] .preview-surfaces { display:block; }
  html[data-preview="settings-narrow"] .preview-app { max-width:780px; }
  html[data-preview="narrow"] .preview-app { max-width:820px; border-inline:1px solid var(--border); }
  @media(max-width:760px) { .preview-app { grid-template-columns:180px minmax(0,1fr); }.preview-review { width:230px; }.preview-controls span { width:100%; } }
  </style></head><body>${renderPreview()}<script>
  document.querySelectorAll('[data-palette-choice]').forEach(button => button.addEventListener('click', () => { document.documentElement.dataset.palette = button.dataset.paletteChoice; }));
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    document.documentElement.dataset.theme = mode.includes('dark') ? 'dark' : 'light';
    document.documentElement.dataset.preview = mode;
    document.querySelectorAll('[data-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));
  </script></body></html>`;
  await mkdir(".cache/workspace-preview", { recursive: true });
  await writeFile(".cache/workspace-preview/index.html", html);
  console.log("Generated .cache/workspace-preview/index.html (fictional data, no model or filesystem access).");
} finally {
  await rm(join(directory, "preview.cjs"), { force: true });
  await rmdir(directory);
}
