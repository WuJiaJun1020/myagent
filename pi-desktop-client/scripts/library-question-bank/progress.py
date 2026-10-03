"""Recoverable progress snapshot without trusting a partially written JSON file."""
import json,sys
from pathlib import Path
from datetime import datetime
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parents[2];m=json.loads((root/'.cache/library-authoring-v2/manifest.json').read_text(encoding='utf-8'))
result={'updated':datetime.now().isoformat(timespec='seconds'),'model':'gpt-6-luna','reasoning':'high','roles':{}}
for role in ['simple','medium','hard']:
    ids=[];broken=[]
    for p in sorted((root/'resources/smart-library/question-bank/drafts/v2').glob(role+'-*.json')):
        try:ids.extend(q['sample_id'] for q in json.loads(p.read_text(encoding='utf-8-sig')))
        except Exception as e:broken.append(p.name)
    assigned={p['sample_id'] for p in m['plan'][role]};actual=set(ids)
    result['roles'][role]={'written':len(actual),'expected':len(assigned),'missing':sorted(assigned-actual),'duplicates':sorted({i for i in ids if ids.count(i)>1}),'incompleteFiles':broken}
(root/'.cache/library-authoring-v2/progress.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
