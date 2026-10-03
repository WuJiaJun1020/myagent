// Check real packaged dependencies, without falling back to development node_modules.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const unpacked = path.join(root, 'release', 'win-unpacked');
const archive = path.join(unpacked, 'resources', 'app.asar');

function samplePdf() {
  const text = 'BT /F1 12 Tf 30 80 Td (PACKAGED_PDF_OK) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 120] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  return Buffer.from(`${pdf}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

async function checkRuntime() {
  const packagedRequire = createRequire(path.join(archive, 'package.json'));
  const tempRoot = path.join(root, '.cache', 'package-audit');
  fs.mkdirSync(tempRoot, { recursive: true });
  const databasePath = fs.mkdtempSync(path.join(tempRoot, 'lance-'));
  const lance = packagedRequire('@lancedb/lancedb');
  const database = await lance.connect(databasePath);
  try {
    const table = await database.createTable('check', [{ id: 1, vector: [1, 0] }, { id: 2, vector: [0, 1] }]);
    try {
      assert.equal((await table.vectorSearch([1, 0]).limit(1).toArray())[0].id, 1);
    } finally { table.close(); }
  } finally { database.close(); }
  console.log('PASS: packaged LanceDB write and vector search');

  const { PDFParse } = packagedRequire('pdf-parse');
  const pdf = new PDFParse({ data: samplePdf() });
  try { assert.match((await pdf.getText()).text, /PACKAGED_PDF_OK/); }
  finally { await pdf.destroy(); }
  console.log('PASS: packaged PDF text extraction and worker');

  const mammoth = packagedRequire('mammoth');
  const zipRequire = createRequire(packagedRequire.resolve('mammoth'));
  const zip = new (zipRequire('jszip'))();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>打包文档测试</w:t></w:r></w:p></w:body></w:document>');
  assert.match((await mammoth.extractRawText({ buffer: await zip.generateAsync({ type: 'nodebuffer' }) })).value, /打包文档测试/);
  console.log('PASS: packaged DOCX extraction');

  const pi = await import(pathToFileURL(path.join(archive, 'node_modules/@earendil-works/pi-coding-agent/dist/bundle/index.js')).href);
  assert.equal(typeof pi.ModelRuntime.create, 'function');
  assert.equal(typeof pi.SettingsManager.create, 'function');
  console.log('PASS: packaged shared Pi model SDK');

  await new Promise((resolve, reject) => {
    const terminal = packagedRequire('node-pty').spawn(path.join(process.env.SystemRoot, 'System32', 'cmd.exe'), ['/d', '/q'], {
      cwd: tempRoot, env: process.env, cols: 80, rows: 24,
    });
    let output = '';
    const timer = setTimeout(() => { terminal.kill(); reject(new Error('Packaged PTY timeout')); }, 10000);
    terminal.onData(data => { output += data; });
    terminal.onExit(() => {
      clearTimeout(timer);
      try { assert.match(output, /PACKAGED_PTY_OK/); resolve(); } catch (error) { reject(error); }
    });
    terminal.write('echo PACKAGED_PTY_OK\r\nexit\r\n');
  });
  console.log('PASS: packaged PTY command and output');

  const developmentModules = path.join(root, 'node_modules') + path.sep;
  assert(!Object.keys(require.cache).some(file => file.startsWith(developmentModules)),
    'Runtime check must not fall back to development node_modules');
}

if (process.argv.includes('--worker')) {
  // The imported SDK/native modules may retain handles; this isolated worker has
  // completed all awaited checks and must not keep the verification parent alive.
  checkRuntime().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
} else {
  const asar = require('@electron/asar');
  const files = asar.listPackage(archive).map(file => file.replaceAll('\\', '/'));
  assert(!files.some(file => file.startsWith('/node_modules/monaco-editor/')), 'Full Monaco dependency should not ship');
  assert(!files.some(file => file.startsWith('/node_modules/') && file.endsWith('.map')), 'Dependency source maps should not ship');
  assert(!files.some(file => file.includes('/pdf-parse/dist/pdf-parse/web/')), 'Unused PDF browser bundle should not ship');
  assert(files.some(file => /\/dist\/renderer\/assets\/monaco-runtime-.*\.js$/.test(file)), 'Compiled Monaco must remain');
  assert(fs.existsSync(path.join(unpacked, 'resources/licenses/Monaco-MIT.txt')), 'Monaco license must remain');
  const locales = fs.readdirSync(path.join(unpacked, 'locales')).filter(file => file.endsWith('.pak')).sort();
  assert.deepEqual(locales, ['en-US.pak', 'zh-CN.pak', 'zh-TW.pak']);
  console.log('PASS: package exclusions, bundled editor, license and locales');
  const child = spawnSync(path.join(unpacked, 'Pi Desktop.exe'), [__filename, '--worker'], {
    cwd: unpacked, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_PATH: '' }, windowsHide: true,
    stdio: 'inherit', timeout: 60000,
  });
  if (child.error) console.error(child.error);
  process.exitCode = child.status ?? 1;
}
