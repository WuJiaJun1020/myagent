// Native SQLite/FTS cleanup with independent books and rollback protection.
const {DatabaseSync}=require('node:sqlite');
const {mkdir,writeFile,stat,symlink,readFile}=require('node:fs/promises');
const {resolve,join}=require('node:path');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const {pruneBookIndexRows,pruneUnreferencedVectorDirectories,reclaimSqliteSpace}=require('../../dist/main/library-index-retention.cjs');
const root=resolve('.cache/library-retention/'+Date.now());
(async()=>{
  await mkdir(root,{recursive:true});const db=new DatabaseSync(join(root,'indexes.sqlite'));
  try {
    db.exec(`CREATE TABLE jobs(version TEXT PRIMARY KEY,book TEXT,created INTEGER,data TEXT);
      CREATE TABLE active(book TEXT PRIMARY KEY,version TEXT);
      CREATE TABLE chapters(book TEXT,source TEXT,chapter INTEGER,text TEXT);
      CREATE TABLE paragraphs(book TEXT,source TEXT,id TEXT);
      CREATE TABLE chunks(version TEXT,ordinal INTEGER,text TEXT);
      CREATE VIRTUAL TABLE chunk_terms USING fts5(version UNINDEXED,ordinal UNINDEXED,tokens);
      CREATE TABLE qa_turns(id TEXT,data TEXT);`);
    const versions=Array.from({length:4},()=>randomUUID());
    for(const [i,version] of versions.entries()) {
      const book=i===3?'book-b':'book-a',source='source-'+i;
      db.prepare('INSERT INTO jobs VALUES(?,?,?,?)').run(version,book,i,JSON.stringify({source}));
      db.prepare('INSERT INTO chapters VALUES(?,?,0,?)').run(book,source,'林舟保管铜钥匙。');
      db.prepare('INSERT INTO paragraphs VALUES(?,?,?)').run(book,source,'paragraph');
      for(let n=0;n<100;n++) {
        db.prepare('INSERT INTO chunks VALUES(?,?,?)').run(version,n,'正文'.repeat(500));
        db.prepare('INSERT INTO chunk_terms VALUES(?,?,?)').run(version,n,'林舟 铜钥匙 '.repeat(200));
      }
      await mkdir(join(root,'vectors',version),{recursive:true});await writeFile(join(root,'vectors',version,'marker'),book);
    }
    db.prepare('INSERT INTO active VALUES(?,?)').run('book-a',versions[1]);db.prepare('INSERT INTO active VALUES(?,?)').run('book-b',versions[3]);
    db.prepare('INSERT INTO qa_turns VALUES(?,?)').run('turn','preserve history and citations');
    const before=(await stat(join(root,'indexes.sqlite'))).size;
    db.exec('BEGIN');pruneBookIndexRows(db,'book-a',[versions[1],versions[2]]);db.exec('ROLLBACK');
    assert.equal(db.prepare('SELECT count(*) n FROM jobs').get().n,4,'Cleanup must roll back with the version switch');
    db.exec('BEGIN');assert.deepEqual(pruneBookIndexRows(db,'book-a',[versions[1],versions[2]]),[versions[0]]);db.exec('COMMIT');
    assert.equal(db.prepare('SELECT count(*) n FROM jobs WHERE book=?').get('book-a').n,2);
    db.exec('BEGIN');db.prepare('UPDATE active SET version=? WHERE book=?').run(versions[2],'book-a');pruneBookIndexRows(db,'book-a',[versions[2]]);db.exec('COMMIT');
    await pruneUnreferencedVectorDirectories(db,root);reclaimSqliteSpace(db);
    assert.equal(db.prepare('SELECT count(*) n FROM jobs').get().n,2);
    assert.equal(db.prepare('SELECT count(*) n FROM chapters').get().n,2);
    assert.equal(db.prepare('SELECT count(*) n FROM paragraphs').get().n,2);
    assert.equal(db.prepare('SELECT count(*) n FROM chunks').get().n,200);
    assert.equal(db.prepare('SELECT count(*) n FROM chunk_terms WHERE chunk_terms MATCH ?').get('铜钥匙').n,200);
    assert.equal(db.prepare('SELECT data FROM qa_turns').get().data,'preserve history and citations');
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    for(const v of versions.slice(0,2))await assert.rejects(stat(join(root,'vectors',v)),{code:'ENOENT'});
    assert.equal(await readFile(join(root,'vectors',versions[3],'marker'),'utf8'),'book-b');
    const after=(await stat(join(root,'indexes.sqlite'))).size;assert(after<before,'VACUUM must return free pages to disk');
    const outside=join(root,'outside');await mkdir(outside);await writeFile(join(outside,'keep'),'untouched');
    await symlink(outside,join(root,'vectors',randomUUID()),'junction');
    await assert.rejects(pruneUnreferencedVectorDirectories(db,root),/类型异常/);
    assert.equal(await readFile(join(outside,'keep'),'utf8'),'untouched');
    console.log('PASS retention: atomic rollback, one active + one pending, obsolete SQL/FTS/source/vector cleanup, other books and QA preserved, VACUUM reclaim, unsafe junction refused',{before,after});
  }finally{db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
