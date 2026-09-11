const { existsSync, readFileSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");

const htmlPath = resolve(__dirname, "..", "dist", "renderer", "index.html");
const html = readFileSync(htmlPath, "utf8");
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
const assetReferences = references.filter((reference) => !reference.startsWith("data:"));
const absoluteReferences = assetReferences.filter((reference) => reference.startsWith("/"));

if (absoluteReferences.length) {
  console.error(`Electron file:// 页面包含绝对资源路径：${absoluteReferences.join(", ")}`);
  process.exit(1);
}

const missing = assetReferences.filter((reference) =>
  !existsSync(join(dirname(htmlPath), reference.replace(/^\.\//, ""))),
);
if (missing.length) {
  console.error(`构建页面引用了不存在的资源：${missing.join(", ")}`);
  process.exit(1);
}

console.log(JSON.stringify({
  success: true,
  html: htmlPath,
  assets: assetReferences,
}, null, 2));
