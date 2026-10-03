"""Validate all 200 additions and append to the unchanged 30-question inventory."""
import bisect, hashlib, json, os, sys
from pathlib import Path
from dedup import screen
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parents[2]
if json.loads((root/'resources/smart-library/question-bank/candidates.json').read_text(encoding='utf-8')).get('residentGeneration'):
    sys.exit('增补批次已转为常驻题集，禁止重新合并已停用的首批题目。')
manifest=json.loads((root/'.cache/library-authoring-v2/manifest.json').read_text(encoding='utf-8'))
raw=Path(manifest['source']).read_bytes().decode('utf-8')
assert hashlib.sha256(Path(manifest['source']).read_bytes()).hexdigest()==manifest['source_sha256']
chapters={c['chapter_id']:c for c in manifest['chapters']}
line_ends=[i for i,c in enumerate(raw) if c=='\n']
existing=json.loads((root/'.cache/library-authoring-v2/existing-questions.json').read_text(encoding='utf-8'))
old=[q for q in existing if not q['sample_id'].startswith('T')]
out=[]
for role,difficulty,number,min_chapters,min_evidence,max_evidence in [('simple','简单',100,1,2,4),('medium','中等',50,2,3,6),('hard','困难',50,3,5,8)]:
    questions=[]
    for path in sorted((root/'resources/smart-library/question-bank/drafts/v2').glob(role+'-*.json')):
        questions+=json.loads(path.read_text(encoding='utf-8-sig'))
    assert len(questions)==number,(role,'quantity',len(questions),number)
    allocation={p['sample_id']:p for p in manifest['plan'][role]}
    assert set(q['sample_id'] for q in questions)==set(allocation),(role,'assigned IDs')
    assert all(sum(q['stratum']==s for q in questions)==number//10 for s in range(1,11)),(role,'stratified balance')
    for q in sorted(questions,key=lambda q:q['sample_id']):
        slot=allocation[q['sample_id']]
        assert q['difficulty']==difficulty and q['stratum']==slot['stratum']
        assert slot['start_chapter_id']<=q['anchor_chapter_id']<=slot['end_chapter_id'],(q['sample_id'],'anchor outside stratum')
        assert all(isinstance(q.get(k),str) and q[k].strip() for k in ['question','answer','reasoning','event_key'])
        assert 2<=len(q.get('answer_points',[]))<=8 and all(isinstance(p,str) and p.strip() for p in q['answer_points'])
        assert min_evidence<=len(q['evidence'])<=max_evidence,(q['sample_id'],'evidence count')
        evidence_chapters=sorted({int(e['chapter_id'][1:]) for e in q['evidence']})
        assert len(evidence_chapters)>=min_chapters,(q['sample_id'],'chapter diversity')
        assert q['anchor_chapter_id'] in {e['chapter_id'] for e in q['evidence']},(q['sample_id'],'anchor must be used')
        if role=='hard':
            assert evidence_chapters[-1]-evidence_chapters[0]>=20,(q['sample_id'],'distant evidence span')
            assert max(b-a for a,b in zip(evidence_chapters,evidence_chapters[1:]))>=8,(q['sample_id'],'separated stages')
            assert isinstance(q.get('cross_chapter_reason'),str) and q['cross_chapter_reason'].strip()
        ranges=[]
        for number,e in enumerate(q['evidence'],1):
            c=chapters[e['chapter_id']];text=raw[c['start_cp']:c['end_cp']];quote=e['quote'];at=text.find(quote)
            assert at>=0,(q['sample_id'],number,e['chapter_id'],'quote absent')
            assert text.find(quote,at+1)<0,(q['sample_id'],number,'ambiguous quote')
            start=c['start_cp']+at;end=start+len(quote)
            assert not any(start<b and end>a for a,b in ranges),(q['sample_id'],number,'overlap')
            ranges.append((start,end))
            # A complete short sentence can be valid evidence; exact coordinates,
            # unique occurrence and non-overlap matter more than an arbitrary length.
            assert quote.strip() and e['supports'].strip() and e['required'] is True,(q['sample_id'],number,'empty or non-required evidence')
            utf16=c['start_utf16']+len(text[:at].encode('utf-16-le'))//2
            e.update(evidence_id=f"{q['sample_id']}-E{number:02d}",volume=c['volume'],chapter_label=c['chapter_label'],start_utf16=utf16,end_utf16=utf16+len(quote.encode('utf-16-le'))//2,line_start=bisect.bisect_left(line_ends,start)+1,line_end=bisect.bisect_left(line_ends,end-1)+1)
        q.update(source_sha256=manifest['source_sha256'],generation='fanren-expansion-v2',prompt_version='v2',author_model='gpt-6-luna',reasoning_level='high')
        out.append(q)
human=[]
if os.environ.get('APPDATA'):
    review_file=Path(os.environ['APPDATA'])/'pi-desktop-client/modules/smart-library/question-bank'/ (manifest['source_sha256']+'.json')
    if review_file.exists():
        records=json.loads(review_file.read_text(encoding='utf-8'));seed_by_id={q['sample_id']:q for q in old}
        for entry in records['entries']:
            q=entry['question']
            if q['sample_id'] in seed_by_id and q!=seed_by_id[q['sample_id']]:
                human.append({**q,'sample_id':q['sample_id']+':human'})
problems=screen(existing+human+out,{q['sample_id'] for q in out})
report={'newQuestions':len(out),'comparedAgainst':len(existing),'humanVariants':len(human),'method':'normalized exact + character trigram question/answer points + raw-coordinate evidence overlap; signals require semantic review','pairs':problems}
semantic_file=root/'resources/smart-library/question-bank/semantic-review-v2.json'
if semantic_file.exists():
    findings=json.loads(semantic_file.read_text(encoding='utf-8'))
    report['authorSemanticReview']=findings
    assert all(f.get('status')=='resolved' for f in findings),'Unresolved author review finding'
report_path=root/'resources/smart-library/question-bank/dedup-review-v2.json'
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
assert not any(p['blocking'] for p in problems),'Exact question/knowledge-point duplicate; see dedup-review-v2.json'
current=json.loads((root/'resources/smart-library/question-bank/candidates.json').read_text(encoding='utf-8'))
current_old=[q for q in current['questions'] if q['sample_id'] in {q['sample_id'] for q in old}]
assert current_old==old,'Original 30 questions changed; do not overwrite human edits or seed provenance'
# Inventory ID stays stable; newly added IDs start pending without resetting original reviews.
current.update(promptVersion='v1 / v2',questions=old+out)
current['generations']=[{'id':'fanren-candidates-v1','promptVersion':'v1','count':30},{'id':'fanren-expansion-v2','promptVersion':'v2','count':200,'seed':manifest['seed'],'model':'gpt-6-luna','reasoning':'high'}]
(root/'resources/smart-library/question-bank/candidates.json').write_text(json.dumps(current,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Validated 200 additions; retained 30 unchanged; {sum(len(q["evidence"]) for q in out)} new exact source quotes. Similarity review pairs: {len(problems)}')
