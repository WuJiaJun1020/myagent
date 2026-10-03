"""Conservative lexical/answer/evidence screening. Similarity is a review signal, not proof."""
import re, unicodedata
from functools import lru_cache

def normalize(text):
    return re.sub(r'[^\w\u3400-\u9fff]','',unicodedata.normalize('NFKC',text).lower())

@lru_cache(maxsize=4096)
def grams(text,n=3):
    text=normalize(text)
    return frozenset(text[i:i+n] for i in range(max(0,len(text)-n+1)))

def similarity(a,b):
    x,y=grams(a),grams(b)
    return len(x&y)/len(x|y) if x and y else 0

def containment(a,b):
    x,y=grams(a),grams(b)
    return len(x&y)/min(len(x),len(y)) if x and y else 0

def spans(q):
    return [(e.get('start_utf16',-1),e.get('end_utf16',-1)) for e in q.get('evidence',[]) if 'start_utf16' in e]

def evidence_overlap(a,b):
    x,y=spans(a),spans(b)
    denom=min(sum(end-start for start,end in x),sum(end-start for start,end in y))
    if not denom:return 0
    overlap=sum(max(0,min(b1,b2)-max(a1,a2)) for a1,b1 in x for a2,b2 in y)
    return min(1,overlap/denom)

def screen(questions,new_ids):
    problems=[]
    for i,a in enumerate(questions):
        for b in questions[i+1:]:
            if a['sample_id'] not in new_ids and b['sample_id'] not in new_ids:continue
            same_question=normalize(a['question'])==normalize(b['question'])
            same_key=bool(a.get('event_key') and b.get('event_key') and normalize(a['event_key'])==normalize(b['event_key']))
            question=similarity(a['question'],b['question'])
            answer=containment(a.get('answer',''),b.get('answer',''))
            points=containment('；'.join(a.get('answer_points',[])),'；'.join(b.get('answer_points',[])))
            overlap=evidence_overlap(a,b)
            reasons=[]
            if same_question:reasons.append('题干规范化完全相同')
            if same_key:reasons.append('知识点标识相同')
            if question>=.52:reasons.append('题干高度相似')
            if answer>=.66 and question>=.18:reasons.append('答案高度包含且问题相关')
            if overlap>=.55 and answer>=.38:reasons.append('主要证据与答案重合')
            if points>=.7:reasons.append('答案要点高度重合')
            if reasons:
                problems.append({'a':a['sample_id'],'b':b['sample_id'],'reasons':reasons,'blocking':same_question or same_key,'questionSimilarity':round(question,3),'answerContainment':round(answer,3),'pointContainment':round(points,3),'evidenceOverlap':round(overlap,3)})
    return problems
