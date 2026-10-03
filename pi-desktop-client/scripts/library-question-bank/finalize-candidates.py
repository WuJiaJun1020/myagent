"""Verify authored quotes against the unmodified original; never approve candidates."""
import bisect
import hashlib
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
if json.loads((root/'resources/smart-library/question-bank/candidates.json').read_text(encoding='utf-8')).get('residentGeneration'):
    sys.exit('首批题目已停用，禁止覆盖常驻题集。')
manifest = json.loads((root / '.cache/library-authoring/manifest.json').read_text(encoding='utf-8'))
data = Path(manifest['source']).read_bytes()
source_hash = hashlib.sha256(data).hexdigest()
assert source_hash == manifest['source_sha256'], 'Source changed; sampling must be regenerated'
raw = data.decode('utf-8')
chapters = {c['chapter_id']: c for c in manifest['chapters']}
line_ends = [i for i, c in enumerate(raw) if c == '\n']
out = []
for role, difficulty, prefix, min_chapters, max_evidence in [('simple','简单','S',1,4),('medium','中等','M',2,6),('hard','困难','H',3,8)]:
    questions = json.loads((root / f'resources/smart-library/question-bank/drafts/{role}.json').read_text(encoding='utf-8-sig'))
    assert len(questions) == 10, (role, 'must have 10 questions')
    assert sorted(q['stratum'] for q in questions) == list(range(1,11)), (role, 'strata must be unique')
    for i, q in enumerate(sorted(questions,key=lambda q: q['stratum']),1):
        assert q['sample_id'] == f'{prefix}{i:03d}' and q['difficulty'] == difficulty
        assert q['question'].strip() and q['answer'].strip() and q['reasoning'].strip()
        bounds = manifest['plan'][role]['items'][i-1]
        assert bounds['start_chapter_id'] <= q['anchor_chapter_id'] <= bounds['end_chapter_id'], (q['sample_id'],'anchor outside stratum')
        assert 2 <= len(q['evidence']) <= max_evidence, (q['sample_id'],'evidence count')
        assert len(set(e['chapter_id'] for e in q['evidence'])) >= min_chapters, (q['sample_id'],'chapter diversity')
        assert q['anchor_chapter_id'] in {e['chapter_id'] for e in q['evidence']}
        ranges=[]
        for number, e in enumerate(q['evidence'],1):
            c=chapters[e['chapter_id']]
            text=raw[c['start_cp']:c['end_cp']]
            quote=e['quote']
            at=text.find(quote)
            assert at >= 0, (q['sample_id'],number,'quote absent from specified chapter')
            assert text.find(quote,at+1)<0, (q['sample_id'],number,'ambiguous quote')
            start=c['start_cp']+at
            end=start+len(quote)
            assert not any(start<b and end>a for a,b in ranges), (q['sample_id'],'overlapping evidence')
            ranges.append((start,end))
            assert len(quote)>=15 and e['supports'].strip() and e['required'] is True, (q['sample_id'],'weak evidence metadata')
            start_utf16=c['start_utf16']+len(text[:at].encode('utf-16-le'))//2
            e.update(evidence_id=f"{q['sample_id']}-E{number:02d}", volume=c['volume'],chapter_label=c['chapter_label'],start_utf16=start_utf16,end_utf16=start_utf16+len(quote.encode('utf-16-le'))//2,line_start=bisect.bisect_left(line_ends,start)+1,line_end=bisect.bisect_left(line_ends,end-1)+1)
        q['source_sha256']=source_hash
        out.append(q)
assert len(set(q['question'] for q in out))==30, 'duplicate question'
batch={'batch':'fanren-candidates-v1','model':'gpt-6-luna · high','promptVersion':'v1','source_sha256':source_hash,'sampling':manifest['plan'],'questions':out}
# Do not ship machine-local source paths/windows in the portable question resource.
batch['sampling']={role:{'seed':p['seed'],'items':[{k:v for k,v in item.items() if k!='window'} for item in p['items']]} for role,p in batch['sampling'].items()}
target=root / 'resources/smart-library/question-bank/candidates.json'
target.write_text(json.dumps(batch,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Verified {len(out)} pending questions / {sum(len(q["evidence"]) for q in out)} exact source quotes; SHA-256 {source_hash}')
for difficulty in ['简单','中等','困难']:
    selected=[q for q in out if q['difficulty']==difficulty]
    print(difficulty+': '+', '.join(q['anchor_chapter_id'] for q in selected))
