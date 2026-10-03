const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const JSZip = require('jszip');

/** Reproducible EPUB fixture. No dependency on another test's cache or output. */
async function createLibraryEpub() {
  const synthetic = await readFile(join(__dirname, '../fixtures/library/山灯记.txt'), 'utf8');
  const chapters = synthetic.trim().split(/(?=^第[一二三四]章)/m).filter(Boolean);
  const zip = new JSZip();
  const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OPS/book.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">pi-library-stage0</dc:identifier><dc:title>山灯记</dc:title><dc:creator>Pi Desktop 测试样本</dc:creator><dc:language>zh</dc:language><meta property="dcterms:modified">2026-09-28T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${chapters.map((_, i) => `<item id="c${i}" href="${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`);
  zip.file('OPS/nav.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol>${chapters.map((c, i) => `<li><a href="${i}.xhtml">${escape(c.split('\n')[0])}</a></li>`).join('')}</ol></nav></body></html>`);
  chapters.forEach((chapter, i) => { const [title, ...paragraphs] = chapter.trim().split('\n'); zip.file(`OPS/${i}.xhtml`, `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escape(title)}</title></head><body><h1>${escape(title)}</h1>${paragraphs.map(p => `<p>${escape(p)}</p>`).join('')}</body></html>`); });
  return zip.generateAsync({ type: 'nodebuffer' });
}
module.exports = { createLibraryEpub };
