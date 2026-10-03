// Existing ready indexes only. Uses LanceDB's transaction-aware maintenance API.
// Default is a read-only inventory; --apply is required for maintenance.
const { DatabaseSync } = require('node:sqlite');
const { connect } = require('@lancedb/lancedb');
const { optimizeVectorStorage, storageSize } = require('../dist/main/library-vector-storage.cjs');
const { pruneBookIndexRows, pruneUnreferencedVectorDirectories, reclaimSqliteSpace } = require('../dist/main/library-index-retention.cjs');
const { execFileSync } = require('node:child_process');
const { readdir, readFile, mkdir, writeFile } = require('node:fs/promises');
const { resolve, join } = require('node:path');
const assert = require('node:assert/strict');
const apply = process.argv.includes('--apply');
const root = resolve(process.env.APPDATA, 'pi-desktop-client', 'modules', 'smart-library');
const reportRoot = resolve('.cache/library-storage-maintenance/' + Date.now());
function requireOffline() {
  // The current version is retained, but old readers can require old files.
  // Only perform immediate pruning when no client/native test owns this data.
  const executable = process.execPath.replaceAll("'", "''");
  const userdata = resolve(root,'../..').replaceAll("'", "''");
  const check = `$clients = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ProcessId -ne ${process.pid} -and (($_.ExecutablePath -eq '${executable}') -or ($_.Name -eq 'electron.exe' -and $_.CommandLine -and $_.CommandLine.Contains('${userdata}')) -or $_.Name -like '*Pi*Desktop*.exe') }); if ($clients.Count) { 'running' } else { 'offline' }`;
  if(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',check],{encoding:'utf8',windowsHide:true}).trim()!=='offline')throw Error('请先退出 Pi 客户端，再整理为单一版本；不会删除正在读取的文件');
}
const existsRunning = async () => {
  const directory=join(root,'evaluation');
  for(const id of await readdir(directory).catch(()=>[])) {
    const status=JSON.parse(await readFile(join(directory,id,'latest.json'),'utf8').catch(()=>'{}'));
    if(status.state==='running')throw Error('评测正在运行，暂不整理索引');
  }
};
async function probe(directory,total) {
  const connection=await connect(directory);
  try {
    const table=await connection.openTable('chunks');
    try {
      const result=[];
      for(const ordinal of [...new Set([Math.min(5,total-1),Math.floor(total/3),Math.floor(total*2/3),total-1])]) {
        const source=(await table.query().where('ordinal = '+ordinal).limit(1).toArray())[0];
        assert(source,'Missing probe vector '+ordinal);
        const hits=await table.vectorSearch(Array.from(source.vector)).distanceType('cosine').limit(8).select(['id','ordinal','_distance']).toArray();
        result.push({ordinal,hits:hits.map(h=>({id:h.id,ordinal:h.ordinal,distance:h._distance}))});
      }
      return result;
    } finally {table.close();}
  } finally {connection.close();}
}
(async()=>{
  if(apply)requireOffline();
  await existsRunning();
  const db=new DatabaseSync(join(root,'indexes.sqlite'),{readOnly:!apply});
  try {
    const jobs=db.prepare('SELECT data FROM jobs ORDER BY created,rowid').all().map(row=>JSON.parse(row.data));
    if(jobs.some(job=>job.state==='running'))throw Error('索引正在运行，暂不整理');
    const active=db.prepare('SELECT a.book,a.version,j.data FROM active a JOIN jobs j ON a.version=j.version').all();
    const result=[];
    for(const item of active) {
      const job=JSON.parse(item.data);assert.equal(job.state,'ready');assert.equal(job.completed,job.total);
      assert.match(item.version,/^[a-f0-9-]{36}$/);
      const directory=join(root,'vectors',item.version);
      const before=await storageSize(directory);console.log('Ready index',item.version,JSON.stringify(before),'rows',job.total);
      if(!apply)continue;
      await existsRunning();
      const beforeProbes=await probe(directory,job.total);
      requireOffline();
      console.log('Compacting and pruning history; keeping only current vector data and one manifest');
      const report=await optimizeVectorStorage(directory,job.total,{exclusive:true});
      assert.equal(db.prepare('SELECT data FROM jobs WHERE version=?').get(item.version).data,item.data,'Index job changed during maintenance');
      assert.equal(db.prepare('SELECT version FROM active WHERE book=?').get(item.book).version,item.version,'Active index changed');
      const afterProbes=await probe(directory,job.total);
      for(let i=0;i<beforeProbes.length;i++) {
        const before=beforeProbes[i].hits,after=afterProbes[i].hits;
        assert.deepEqual(after.map(h=>h.id),before.map(h=>h.id),'Top-8 probe ranking changed');
        for(let j=0;j<before.length;j++)assert(Math.abs(after[j].distance-before[j].distance)<1e-6,'Probe score changed');
      }
      const record={book:item.book,version:item.version,...report,probes:afterProbes};
      result.push(record);console.log('Verified optimized index',JSON.stringify(report));
    }
    if(apply) {
      let removed=[];
      db.exec('BEGIN IMMEDIATE');
      try {
        for(const book of [...new Set(jobs.map(job=>job.book))]) {
          const current=db.prepare('SELECT version FROM active WHERE book=?').get(book)?.version;
          const latest=jobs.filter(job=>job.book===book).at(-1);
          if(latest?.state==='ready'&&!current)throw Error('已完成索引没有有效指针，停止清理以保留数据');
          // Current data plus one resumable pending replacement, if present.
          const keep=[...(current?[current]:[]),...(latest&&latest.state!=='ready'?[latest.version]:[])];
          removed.push(...pruneBookIndexRows(db,book,keep));
        }
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      await pruneUnreferencedVectorDirectories(db,root);
      if(removed.length)reclaimSqliteSpace(db);
      await mkdir(reportRoot,{recursive:true});await writeFile(join(reportRoot,'report.json'),JSON.stringify({root,result,removedSqliteVersions:removed},null,2));console.log('Report:',join(reportRoot,'report.json'));
    }
  } finally {db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
