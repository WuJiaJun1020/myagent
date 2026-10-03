"""Read-only incremental validation while authors work. Broken/incomplete files are reported."""
import argparse,json,sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
parser=argparse.ArgumentParser();parser.add_argument('--role',choices=['simple','medium','hard']);args=parser.parse_args()
root=Path(__file__).resolve().parents[2];m=json.loads((root/'.cache/library-authoring-v2/manifest.json').read_text(encoding='utf-8'))
raw=Path(m['source']).read_bytes().decode('utf-8');chapters={c['chapter_id']:c for c in m['chapters']}
errors=[];count=0;seen=set()
allocation={p['sample_id']:(role,p) for role,slots in m['plan'].items() for p in slots}
for path in sorted((root/'resources/smart-library/question-bank/drafts/v2').glob((args.role or '*')+'-*.json')):
    try:qs=json.loads(path.read_text(encoding='utf-8-sig'))
    except Exception as e:errors.append((path.name,str(e)));continue
    for q in qs:
        count+=1;identifier=q.get('sample_id','?')
        try:
            assert identifier not in seen,'duplicate sample ID'
            seen.add(identifier)
            role,slot=allocation[identifier]
            assert path.name.startswith(role+'-'),'wrong author file'
            assert q['stratum']==slot['stratum'],'wrong stratum'
            assert slot['start_chapter_id']<=q['anchor_chapter_id']<=slot['end_chapter_id'],'anchor outside allocated stratum'
            assert q['difficulty']=={'simple':'简单','medium':'中等','hard':'困难'}[role],'wrong difficulty'
            assert q.get('event_key') and 2<=len(q.get('answer_points',[]))<=8,'knowledge point/answer points missing'
            ranges=[]
            for i,e in enumerate(q['evidence'],1):
                assert e['quote'].strip() and e['supports'].strip() and e['required'] is True,f'quote {i} empty or non-required'
                c=chapters[e['chapter_id']];text=raw[c['start_cp']:c['end_cp']];at=text.find(e['quote']);assert at>=0,f'quote {i} absent from {e["chapter_id"]}'
                assert text.find(e['quote'],at+1)<0,f'quote {i} ambiguous'
                a=c['start_cp']+at;b=a+len(e['quote']);assert not any(a<d and b>s for s,d in ranges),f'quote {i} overlaps'
                ranges.append((a,b))
            ids=sorted({int(e['chapter_id'][1:]) for e in q['evidence']})
            limits={'简单':(1,2,4),'中等':(2,3,6),'困难':(3,5,8)};minimum,lower,upper=limits[q['difficulty']]
            assert len(ids)>=minimum and lower<=len(q['evidence'])<=upper,'evidence count/chapter diversity'
            assert q['anchor_chapter_id'] in {e['chapter_id'] for e in q['evidence']},'anchor absent from evidence'
            if q['difficulty']=='困难':assert ids[-1]-ids[0]>=20 and max(b-a for a,b in zip(ids,ids[1:]))>=8 and q.get('cross_chapter_reason'),'distant necessary evidence requirement'
        except Exception as e:errors.append((identifier,str(e)))
print(json.dumps({'questions':count,'errors':errors},ensure_ascii=False,indent=2))
sys.exit(bool(errors))
