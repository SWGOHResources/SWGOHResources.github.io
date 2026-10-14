import pdfplumber, json, hashlib, calendar, argparse
from pathlib import Path
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description='Extract the supplied SWGOH timeline PDF')
parser.add_argument('source',type=Path)
src=parser.parse_args().source
p=pdfplumber.open(src).pages[0]
t=p.find_tables({'snap_tolerance':.15,'join_tolerance':.15,'intersection_tolerance':.15,'edge_min_length':.5})[0]
def text(cell):
    x0,y0,x1,y1=cell
    chars=[c for c in p.chars if x0 <= (c['x0']+c['x1'])/2 < x1 and y0 <= (c['top']+c['bottom'])/2 < y1]
    return pdfplumber.utils.extract_text(chars,x_tolerance=.15,y_tolerance=.15).strip()
def band(row):
    return [(c,text(c)) for c in t.rows[row].cells if c and text(c)]
years=band(3); eras=band(2)
periods=[]
for i,(c,name) in enumerate(band(4)):
    mid=(c[0]+c[2])/2
    year=next(int(n) for b,n in years if b[0]<=mid<b[2])
    era=next((n for b,n in eras if b[0]<=mid<b[2]),None)
    month=list(calendar.month_name).index(name) if not era else None
    periods.append(dict(id=i,label=name,year=year,era=era,days=28 if era else calendar.monthrange(year,month)[1],x0=c[0],x1=c[2]))
entries=[]
covered=[]
for row in [0,1,5,6,7,8]:
    for c,raw in band(row):
        ids=[q['id'] for q in periods if min(c[2],q['x1'])-max(c[0],q['x0'])>.3]
        entries.append(dict(id=len(entries),name=' '.join(raw.split()),sourceText=raw,track='conquest' if row<2 else 'journey' if row==8 else 'marquee',sourceRow=row,periods=ids,units=2 if raw=='000 and BT-1' else 1))
        covered.append(c)
# Every source glyph must belong to one extracted entry or heading.
for row in [2,3,4]: covered += [c for c,n in band(row)]
missing=[c['text'] for c in p.chars if c['text'].strip() and not any(b[0]<=(c['x0']+c['x1'])/2<b[2] and b[1]<=(c['top']+c['bottom'])/2<b[3] for b in covered)]
assert not missing, missing
data=dict(source='SWGOH THINGS AND STUFF - TIMELINE OF SWGOH.pdf',sha256=hashlib.sha256(src.read_bytes()).hexdigest(),periods=periods,entries=entries,verification=dict(sourceGlyphs=sum(bool(c['text'].strip()) for c in p.chars),unmappedGlyphs=len(missing)))
(root/'assets/data/game-timeline.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

print('Periods',len(periods),'entries',len(entries),'unmapped glyphs',len(missing))
for e in entries:
    if e['track']=='conquest':print(e['name'],e['periods'])
