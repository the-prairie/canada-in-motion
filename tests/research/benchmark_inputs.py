import json,re,statistics
from html.parser import HTMLParser
from pathlib import Path
class Table(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=[];self.cell=None
 def handle_starttag(self,tag,attrs):
  if tag=='tr':self.row=[]
  if tag=='td':self.cell=[dict(attrs).get('class',''),'']
 def handle_data(self,text):
  if self.cell is not None:self.cell[1]+=text
 def handle_endtag(self,tag):
  if tag=='td' and self.cell is not None:self.row.append(self.cell);self.cell=None
  if tag=='tr':self.rows.append(self.row)
root=Path(__file__).resolve().parents[2];cache=root/'.data-cache/household-price-research';data=json.loads((root/'data/household-energy-costs.json').read_text())
(root/'.data-cache/price-impact-review').mkdir(parents=True,exist_ok=True)
fx={r['d'][:7]:float(r['IEXM0101']['v']) for r in json.loads((cache/'fx-monthly-legacy.json').read_text())['observations'] if 'IEXM0101' in r}
daily={}
for r in json.loads((cache/'fx-current.json').read_text())['observations']:
 if 'FXUSDCAD' in r:daily.setdefault(r['d'][:7],[]).append(float(r['FXUSDCAD']['v']))
fx.update({k:statistics.mean(v) for k,v in daily.items()});count=0
for commodity,file in [('oil','wti-monthly.html'),('gas','henry-hub-monthly.html')]:
 p=Table();p.feed((cache/file).read_text());parsed={}
 for row in p.rows:
  years=[re.search(r'(?:19|20)\d\d',v) for c,v in row if c=='B4'];cells=[v.strip() for c,v in row if c=='B3']
  if not years or years[0] is None or len(cells)!=12:continue
  for i,v in enumerate(cells,1):
   if v:parsed[f'{years[0][0]}-{i:02}']=float(v)
 for month,row in data['observations']['benchmarks'][commodity].items():
  assert row['usd']==parsed[month] and row['fx']==fx[month]
  assert abs(row['cad']-parsed[month]*fx[month])<1e-12
  count+=1
out={'benchmarkCurrencyRecords':count,'verdict':'All stored monthly US-dollar prices and CAD conversions match independently parsed official payloads.'}
(root/'.data-cache/price-impact-review/benchmark-input-results.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
