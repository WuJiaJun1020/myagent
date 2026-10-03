"""Create reproducible stratified authoring windows; never uses stale CSV offsets."""
import bisect, hashlib, json, random, re, sys
from pathlib import Path

SOURCE=Path(r"C:\Users\wujiajun\Desktop\《凡人修仙传》精校版全本（忘语）.txt")
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/".cache"/"library-authoring"

def prepare():
    if json.loads((ROOT/'resources/smart-library/question-bank/candidates.json').read_text(encoding='utf-8')).get('residentGeneration'):
        sys.exit('首批出题流程已停用，不再覆盖常驻题集的出题基线。')
    raw=SOURCE.read_bytes().decode("utf-8")
    headings=list(re.finditer(r"^[ \t]*第[零〇一二三四五六七八九十百千万两\d]+章[^\r\n]{0,65}\r?$",raw,re.M))
    volumes=list(re.finditer(r"^[ \t]*第[零〇一二三四五六七八九十百千万两\d]+卷[^\r\n]*\r?$",raw,re.M))
    astral=[i for i,c in enumerate(raw) if ord(c)>0xffff]
    utf16=lambda position: position+bisect.bisect_left(astral,position)
    chapters=[]
    for i,h in enumerate(headings):
        end=headings[i+1].start() if i+1<len(headings) else len(raw)
        volume=next((v.group().strip() for v in reversed(volumes) if v.start()<h.start()),"")
        chapters.append(dict(chapter_id=f"C{i+1:04d}",chapter_label=h.group().strip(),volume=volume,start_cp=h.start(),end_cp=end,start_utf16=utf16(h.start()),end_utf16=utf16(end)))
    OUT.mkdir(parents=True,exist_ok=True)
    # Agents use complete raw windows, while the manifest retains exact source positions.
    plan={}
    for kind,seed in [("simple",2026093001),("medium",2026093002),("hard",2026093003)]:
        rng=random.Random(seed);items=[]
        for s in range(10):
            lo=s*len(chapters)//10;hi=(s+1)*len(chapters)//10-1
            anchor=rng.randint(lo+12,hi-12);a=max(lo,anchor-5);b=min(hi,anchor+5)
            path=OUT/f"{kind}-{s+1:02d}.txt"
            path.write_bytes("\n\n".join(f"[{c['chapter_id']}｜{c['chapter_label']}]\n"+raw[c['start_cp']:c['end_cp']] for c in chapters[a:b+1]).encode("utf-8"))
            items.append(dict(stratum=s+1,start_chapter_id=chapters[lo]['chapter_id'],end_chapter_id=chapters[hi]['chapter_id'],anchor_chapter_id=chapters[anchor]['chapter_id'],window=str(path)))
        plan[kind]=dict(seed=seed,items=items)
    manifest=dict(source=str(SOURCE),source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),chapters=chapters,plan=plan)
    (OUT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"chapters":len(chapters),"plan":plan},ensure_ascii=False))

if __name__=="__main__":
    sys.stdout.reconfigure(encoding="utf-8");prepare()
