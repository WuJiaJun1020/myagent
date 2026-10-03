"""Prepare 200 disjoint stratified anchors and a shared catalogue of existing questions."""
import hashlib, json, random, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parents[2]
manifest=json.loads((root/'.cache/library-authoring/manifest.json').read_text(encoding='utf-8'))
raw=Path(manifest['source']).read_bytes().decode('utf-8')
assert hashlib.sha256(Path(manifest['source']).read_bytes()).hexdigest()==manifest['source_sha256']
existing=json.loads((root/'resources/smart-library/question-bank/candidates.json').read_text(encoding='utf-8'))
if len(existing['questions'])!=30 or any(q.get('generation')=='fanren-expansion-v2' for q in existing['questions']):
    sys.exit('v2准备只适用于原始30题。本批已合并或题库已变更，拒绝覆盖既有编号与去重基线；新批次须使用新的generation和编号范围。')
legacy=json.loads((root/'tests/fixtures/library/fanren-samples.json').read_text(encoding='utf-8'))
out=root/'.cache/library-authoring-v2';out.mkdir(parents=True,exist_ok=True)
catalogue=legacy['questions']+existing['questions']
(out/'existing-questions.json').write_text(json.dumps(catalogue,ensure_ascii=False,indent=2),encoding='utf-8')
chapters=manifest['chapters'];chapter_dir=out/'chapters';chapter_dir.mkdir(exist_ok=True)
for c in chapters:(chapter_dir/(c['chapter_id']+'.txt')).write_bytes(raw[c['start_cp']:c['end_cp']].encode('utf-8'))
blocked={int(q['anchor_chapter_id'][1:])-1 for q in existing['questions']}
plan={role:[] for role in ['simple','medium','hard']}
counts={'simple':0,'medium':0,'hard':0}
rng=random.Random(2026093004)
for stratum in range(1,11):
    lo=(stratum-1)*len(chapters)//10;hi=stratum*len(chapters)//10
    roles=['simple']*10+['medium']*5+['hard']*5;rng.shuffle(roles)
    for cell,role in enumerate(roles):
        a=lo+cell*(hi-lo)//20;b=lo+(cell+1)*(hi-lo)//20
        choices=[n for n in range(a,b) if all(abs(n-old)>3 for old in blocked)]
        anchor=rng.choice(choices or list(range(a,b)));blocked.add(anchor)
        counts[role]+=1;prefix={'simple':'S','medium':'M','hard':'H'}[role]
        identifier=f'{prefix}{counts[role]+10:03d}'
        window=out/f'{identifier}.txt'
        window.write_bytes('\n\n'.join('['+c['chapter_id']+'｜'+c['chapter_label']+']\n'+raw[c['start_cp']:c['end_cp']] for c in chapters[max(lo,anchor-3):min(hi,anchor+4)]).encode('utf-8'))
        plan[role].append({'sample_id':identifier,'stratum':stratum,'start_chapter_id':chapters[lo]['chapter_id'],'end_chapter_id':chapters[hi-1]['chapter_id'],'anchor_chapter_id':chapters[anchor]['chapter_id'],'window':str(window)})
record={**manifest,'seed':2026093004,'plan':plan,'existing':str(out/'existing-questions.json'),'chapter_dir':str(chapter_dir)}
(out/'manifest.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
draft=root/'resources/smart-library/question-bank/drafts/v2';draft.mkdir(exist_ok=True)
print('Prepared S011–S110 (100), M011–M060 (50), H011–H060 (50); 10 strata, distinct anchors, existing 45-question catalogue.')
