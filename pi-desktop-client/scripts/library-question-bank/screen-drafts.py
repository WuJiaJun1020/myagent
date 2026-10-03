"""Incremental source-aware duplicate screen; never modifies authored or runtime data."""
import hashlib,json,sys
from pathlib import Path
from dedup import screen
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parents[2]
m=json.loads((root/'.cache/library-authoring-v2/manifest.json').read_text(encoding='utf-8'))
raw=Path(m['source']).read_bytes().decode('utf-8');chapters={c['chapter_id']:c for c in m['chapters']}
old=json.loads((root/'.cache/library-authoring-v2/existing-questions.json').read_text(encoding='utf-8'))
out=[];errors=[]
for path in sorted((root/'resources/smart-library/question-bank/drafts/v2').glob('*.json')):
    try:qs=json.loads(path.read_text(encoding='utf-8-sig'))
    except Exception as e:errors.append((path.name,str(e)));continue
    for item in qs:
        q=json.loads(json.dumps(item))
        try:
            for e in q['evidence']:
                c=chapters[e['chapter_id']];t=raw[c['start_cp']:c['end_cp']];at=t.find(e['quote'])
                assert at>=0,f"absent quote {e['chapter_id']}"
                a=c['start_utf16']+len(t[:at].encode('utf-16-le'))//2
                e.update(start_utf16=a,end_utf16=a+len(e['quote'].encode('utf-16-le'))//2)
            out.append(q)
        except Exception as e:errors.append((q['sample_id'],str(e)))
report={'newQuestions':len(out),'invalid':errors,'pairs':screen(old+out,{q['sample_id'] for q in out})}
target=root/'.cache/library-authoring-v2/similarity-review.json';target.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
