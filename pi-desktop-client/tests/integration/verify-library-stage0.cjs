// Run with the Electron Node runtime to verify the same SQLite/native modules as the app.
const { DatabaseSync } = require('node:sqlite');
const { mkdtemp, readFile, writeFile, mkdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const JSZip = require('jszip');

(async () => {
  const started = performance.now();
  const root = await mkdtemp(join(tmpdir(), 'pi-library-stage0-'));
  const report = { runtime: process.versions, checks: [], fixtures: {}, models: 'Not tested by this script; no external network calls.' };
  let connection;
  try {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec("CREATE VIRTUAL TABLE tri USING fts5(text, tokenize='trigram'); INSERT INTO tri VALUES ('林舟把铜钥匙交给苏禾');");
      assert.equal(db.prepare('SELECT count(*) n FROM tri WHERE tri MATCH ?').get('铜钥匙').n, 1);
      assert.equal(db.prepare('SELECT count(*) n FROM tri WHERE tri MATCH ?').get('林舟').n, 0);
      // Deterministic character bigrams: adequate baseline for two-character names, not a linguistic tokenizer.
      const bigrams = text => { const chars = Array.from(text); return chars.slice(0, -1).map((c, i) => c + chars[i + 1]).join(' '); };
      db.exec('CREATE VIRTUAL TABLE terms USING fts5(book UNINDEXED, chapter UNINDEXED, tokens);');
      const insert = db.prepare('INSERT INTO terms VALUES (?, ?, ?)');
      insert.run('A', 1, bigrams('林舟把铜钥匙交给苏禾'));
      insert.run('B', 1, bigrams('林舟在另一本书中'));
      insert.run('A', 3, bigrams('林舟在后续章节出现'));
      const hits = db.prepare('SELECT book, chapter FROM terms WHERE terms MATCH ? AND book = ? AND chapter <= ?').all('林舟', 'A', 1);
      assert.equal(hits.length, 1); assert.equal(hits[0].chapter, 1);
      report.checks.push('SQLite FTS5 available; trigram short-name limitation reproduced; bigram + book/chapter filter passed');
    } finally { db.close(); }
    connection = await require('@lancedb/lancedb').connect(join(root, 'vectors'));
    const table = await connection.createTable('stage0', [
      { id: 'allowed', bookId: 'A', version: 'v1', chapter: 1, vector: [0.8, 0.2] },
      { id: 'other-book', bookId: 'B', version: 'v1', chapter: 1, vector: [1, 0] },
      { id: 'future', bookId: 'A', version: 'v1', chapter: 3, vector: [1, 0] },
      { id: 'old-version', bookId: 'A', version: 'v0', chapter: 1, vector: [1, 0] },
    ]);
    const result = await table.vectorSearch([1, 0]).where("bookId = 'A' AND version = 'v1' AND chapter <= 1").limit(1).toArray();
    assert.equal(result.length, 1); assert.equal(result[0].id, 'allowed');
    report.checks.push('LanceDB vector search prefilters book, index version and chapter before top-k');
    const fixtures = resolve(__dirname, '../../tests/fixtures/library');
    const synthetic = await readFile(join(fixtures, '山灯记.txt'), 'utf8');
    const dataset = JSON.parse(await readFile(join(fixtures, 'questions.json'), 'utf8'));
    const novelPath = process.argv[2];
    let novel;
    if (novelPath) {
      const bytes = await readFile(novelPath);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), dataset.books.fanren.sha256, 'Novel version mismatch');
      try { novel = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { novel = new TextDecoder('gb18030').decode(bytes); }
      report.fixtures.novel = { sha256: dataset.books.fanren.sha256, bytes: bytes.length };
    }
    const chapterText = (text, chapter) => {
      const match = new RegExp('(?:^|\\n)' + chapter + '(?:[^\\r\\n]*)\\r?\\n').exec(text);
      assert.ok(match, `Missing ${chapter}`);
      const from = match.index + match[0].length;
      const next = /\n第[一二三四五六七八九十百千万\d]+章/.exec(text.slice(from));
      return text.slice(from, next ? from + next.index : text.length);
    };
    let checked = 0;
    const anchors = [];
    for (const question of dataset.questions) {
      const text = question.book === 'fanren' ? novel : synthetic;
      if (!text) continue;
      for (const evidence of question.evidence) {
        const chapter = chapterText(text, evidence.chapter);
        assert.ok(chapter.includes(evidence.anchor), `${question.id} anchor missing in ${evidence.chapter}`);
        anchors.push({ question: question.id, chapter: evidence.chapter, offsetInChapter: chapter.indexOf(evidence.anchor) });
      }
      checked++;
    }
    assert.equal(dataset.questions.length, 18);
    report.checks.push(`${checked}/18 questions: evidence anchors located; this is NOT automatic answer correctness evaluation`);
    report.fixtures.anchors = anchors;
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.file('META-INF/container.xml', '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    const chapters = synthetic.trim().split(/(?=^第[一二三四]章)/m).filter(Boolean);
    const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    zip.file('OPS/book.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">pi-library-stage0</dc:identifier><dc:title>山灯记</dc:title><dc:creator>Pi Desktop 测试样本</dc:creator><dc:language>zh</dc:language><meta property="dcterms:modified">2026-09-28T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${chapters.map((_, i) => `<item id="c${i}" href="${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`);
    zip.file('OPS/nav.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol>${chapters.map((c, i) => `<li><a href="${i}.xhtml">${escape(c.split('\n')[0])}</a></li>`).join('')}</ol></nav></body></html>`);
    chapters.forEach((chapter, i) => { const [title, ...paragraphs] = chapter.trim().split('\n'); zip.file(`OPS/${i}.xhtml`, `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escape(title)}</title></head><body><h1>${escape(title)}</h1>${paragraphs.map(p => `<p>${escape(p)}</p>`).join('')}</body></html>`); });
    const out = resolve(__dirname, '../../.cache/library-stage0'); await mkdir(out, { recursive: true });
    await writeFile(join(out, '山灯记.epub'), await zip.generateAsync({ type: 'nodebuffer' }));
    report.elapsedMs = Math.round(performance.now() - started);
    await writeFile(join(out, 'capabilities.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ checks: report.checks, elapsedMs: report.elapsedMs, report: join(out, 'capabilities.json'), epub: join(out, '山灯记.epub') }, null, 2));
  } finally { await connection?.close(); await rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
