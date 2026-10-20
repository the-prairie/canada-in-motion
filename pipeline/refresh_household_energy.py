#!/usr/bin/env python3
"""Calibrate conditional household energy price paths and preserve their audit."""
from pathlib import Path
import argparse,csv,hashlib,io,json,math,random,re,statistics,zipfile
from datetime import datetime,timezone
from urllib.request import Request,urlopen
from refresh_dynamic_price import fit,solve
ROOT=Path(__file__).resolve().parents[1]
MODEL_VERSION='household-energy-2026-10-v1'
SOURCES=[
 {'id':'statcan-household-energy-cpi','title':'Monthly provincial consumer price indexes','publisher':'Statistics Canada','url':'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000401','downloadUrl':'https://www150.statcan.gc.ca/n1/tbl/csv/18100004-eng.zip','filename':'18100004.zip','license':'Statistics Canada Open Licence','licenseUrl':'https://www.statcan.gc.ca/en/reference/licence'},
 {'id':'statcan-household-energy-spending','title':'Household spending, Canada, regions and provinces','publisher':'Statistics Canada','url':'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1110022201','downloadUrl':'https://www150.statcan.gc.ca/n1/tbl/csv/11100222-eng.zip','filename':'11100222.zip','license':'Statistics Canada Open Licence','licenseUrl':'https://www.statcan.gc.ca/en/reference/licence'},
 {'id':'eia-monthly-wti-household','title':'Cushing WTI monthly spot price, USD per barrel','publisher':'US Energy Information Administration','url':'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=RWTC&f=M','downloadUrl':'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=RWTC&f=M','filename':'wti-monthly.html','license':'US government public data','licenseUrl':'https://www.eia.gov/about/copyrights_reuse.php'},
 {'id':'eia-monthly-gas-household','title':'Henry Hub monthly spot price, USD per million Btu','publisher':'US Energy Information Administration','url':'https://www.eia.gov/dnav/ng/hist/rngwhhdm.htm','downloadUrl':'https://www.eia.gov/dnav/ng/hist/rngwhhdm.htm','filename':'henry-hub-monthly.html','license':'US government public data','licenseUrl':'https://www.eia.gov/about/copyrights_reuse.php'},
 {'id':'boc-monthly-fx-household','title':'Historical USD in CAD, monthly noon rate','publisher':'Bank of Canada','url':'https://www.bankofcanada.ca/valet/observations/IEXM0101/json?start_date=1990-01-01','downloadUrl':'https://www.bankofcanada.ca/valet/observations/IEXM0101/json?start_date=1990-01-01','filename':'fx-monthly-legacy.json','license':'Bank of Canada website terms','licenseUrl':'https://www.bankofcanada.ca/terms/'},
 {'id':'boc-daily-fx-household','title':'USD in CAD, daily average rate','publisher':'Bank of Canada','url':'https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?start_date=2017-01-01','downloadUrl':'https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?start_date=2017-01-01','filename':'fx-current.json','license':'Bank of Canada website terms','licenseUrl':'https://www.bankofcanada.ca/terms/'}
]
REGIONS={'Newfoundland and Labrador':'NL','Prince Edward Island':'PE','Nova Scotia':'NS','New Brunswick':'NB','Quebec':'QC','Ontario':'ON','Manitoba':'MB','Saskatchewan':'SK','Alberta':'AB','British Columbia':'BC'}
PRODUCTS={'Gasoline':'oil','Natural gas':'gas','Electricity':'electricity','Fuel oil and other fuels':'heating-oil'}
SPENDING={'Gas and other fuels (all vehicles and tools)':'oil','Natural gas for principal accommodation':'gas','Electricity for principal accommodation':'electricity'}
def table(cache,t):
 with zipfile.ZipFile(cache/(t+'.zip')) as z:
  yield from csv.DictReader(io.TextIOWrapper(z.open(t+'.csv'),encoding='utf-8-sig'))
def parse(cache):
 cpi=[];spending=[]
 for r in table(cache,'18100004'):
  if r['GEO'] in REGIONS and r['Products and product groups'] in PRODUCTS and r['REF_DATE']>='1999-01':
   if r['UOM']!='2002=100' or r['SCALAR_FACTOR']!='units':
    raise ValueError('CPI units changed')
   cpi.append({'region':REGIONS[r['GEO']],'month':r['REF_DATE'],'commodity':PRODUCTS[r['Products and product groups']],'value':float(r['VALUE']) if r['VALUE'] and r['STATUS'] not in ['F','x','..','...'] else None,'status':r['STATUS'],'vector':r['VECTOR']})
 for r in table(cache,'11100222'):
  if r['GEO'] in REGIONS and r['Household expenditures, summary-level categories'] in SPENDING:
   if r['UOM']!='Dollars' or r['SCALAR_FACTOR']!='units' or r['Statistic']!='Average expenditure per household':
    raise ValueError('Household spending identity changed')
   spending.append({'region':REGIONS[r['GEO']],'year':int(r['REF_DATE']),'commodity':SPENDING[r['Household expenditures, summary-level categories']],'value':float(r['VALUE']) if r['VALUE'] and r['STATUS'] not in ['F','x','..','...'] else None,'status':r['STATUS'],'vector':r['VECTOR']})
 for records,fields in [(cpi,('region','month','commodity')),(spending,('region','year','commodity'))]:
  keys=[tuple(r[f] for f in fields) for r in records]
  if len(keys)!=len(set(keys)):raise ValueError('Duplicate household observation identity')
  if any(r['value'] is not None and (not math.isfinite(r['value']) or r['value']<0) for r in records):raise ValueError('Invalid household observation')
 fx={r['d'][:7]:float(r['IEXM0101']['v']) for r in json.loads((cache/'fx-monthly-legacy.json').read_text())['observations'] if 'IEXM0101' in r}
 daily={}
 for r in json.loads((cache/'fx-current.json').read_text())['observations']:
  if 'FXUSDCAD' in r:daily.setdefault(r['d'][:7],[]).append(float(r['FXUSDCAD']['v']))
 fx.update({k:statistics.mean(v) for k,v in daily.items()})
 benchmarks={}
 for k,file in [('oil','wti-monthly.html'),('gas','henry-hub-monthly.html')]:
  benchmark={}
  for block in re.findall(r'<tr[^>]*>(.*?)</tr>',(cache/file).read_text(),re.S|re.I):
   year=re.search(r"class='B4'[^>]*>.*?((?:19|20)\d{2})",block,re.S)
   values=re.findall(r"<td class='B3'>(.*?)</td>",block,re.S)
   if not year or len(values)!=12:continue
   for m,value in enumerate(values,1):
    month=f'{year.group(1)}-{m:02d}'
    if value.strip() and month in fx:benchmark[month]={'usd':float(value),'fx':fx[month],'cad':float(value)*fx[month]}
  if len(benchmark)<300 or any(not math.isfinite(r['cad']) or r['cad']<=0 for r in benchmark.values()):raise ValueError('Benchmark history missing or invalid')
  benchmarks[k]=benchmark
 return {'cpi':cpi,'spending':spending,'benchmarks':benchmarks}
def rows(data,region,commodity,lags):
 cpi={r['month']:r['value'] for r in data['cpi'] if r['region']==region and r['commodity']==commodity and r['value'] and r['status'] not in ['F','x']}
 bench=data['benchmarks'][commodity];months=sorted(set(cpi)&set(bench));out=[]
 for i in range(lags+2,len(months)):
  month=months[i]
  dates=months[i-lags-2:i+1]
  if any((int(b[:4])-int(a[:4]))*12+int(b[-2:])-int(a[-2:])!=1 for a,b in zip(dates,dates[1:])):continue
  y=100*math.log(cpi[month]/cpi[months[i-1]])
  lagy=100*math.log(cpi[months[i-1]]/cpi[months[i-2]])
  base=[1,lagy]+[float(int(month[-2:])==m) for m in range(2,13)]
  dx=[100*math.log(bench[months[i-j]]['cad']/bench[months[i-j-1]]['cad']) for j in range(lags+1)]
  out.append({'month':month,'x':base+dx,'base':base,'y':y,'cpi':cpi[month],'previousCpi':cpi[months[i-1]]})
 return out

def predictions(rows):
 out=[]
 for i,row in enumerate(rows):
  if row['month']<'2015-01' or row['month']>'2025-12' or i<120:continue
  train=rows[:i];b=fit([r['x'] for r in train],[r['y'] for r in train]);a=fit([r['base'] for r in train],[r['y'] for r in train]);dot=lambda x,y:sum(a*b for a,b in zip(x,y))
  out.append({'month':row['month'],'actual':row['y'],'model':dot(row['x'],b),'baseline':dot(row['base'],a),'trainingEnd':train[-1]['month']})
 return out

def annual(rows):
 out=[]
 for i,row in enumerate(rows):
  if not '2015-01'<=row['month']<='2025-01' or row['month'][-2:]!='01' or i<120:continue
  train=rows[:i];future=rows[i:i+12]
  if len(future)!=12 or future[-1]['month']!=row['month'][:4]+'-12':continue
  b=fit([r['x'] for r in train],[r['y'] for r in train]);a=fit([r['base'] for r in train],[r['y'] for r in train]);dot=lambda x,y:sum(a*b for a,b in zip(x,y))
  path=[];basepath=[];last=train[-1]['y'];lastbase=last;level=row['previousCpi'];baselevel=level
  for f in future:
   x=f['x'][:];x[1]=last;last=dot(x,b);level*=math.exp(last/100);path.append(level)
   x=f['base'][:];x[1]=lastbase;lastbase=dot(x,a);baselevel*=math.exp(lastbase/100);basepath.append(baselevel)
  actual=statistics.mean(f['cpi'] for f in future);pred=statistics.mean(path);base=statistics.mean(basepath)
  out.append({'year':int(row['month'][:4]),'actual':actual,'model':pred,'baseline':base,'modelErrorPct':100*(pred/actual-1),'baselineErrorPct':100*(base/actual-1),'trainingEnd':train[-1]['month']})
 return out

def metrics(preds,field='monthly'):
 sets={}
 for label,start,end in [('tuning',2015,2019),('holdout',2020,2025)]:
  p=[r for r in preds if start<=int(str(r.get('month',r.get('year')))[:4])<=end]
  if not p:continue
  a=[abs(r['model']-r['actual']) if field=='monthly' else abs(r['modelErrorPct']) for r in p];b=[abs(r['baseline']-r['actual']) if field=='monthly' else abs(r['baselineErrorPct']) for r in p]
  sets[label]={'n':len(p),'mae':statistics.mean(a),'baselineMae':statistics.mean(b),'improvementPct':100*(1-statistics.mean(a)/statistics.mean(b))}
 return sets

def response(beta,lags,shock=10,temporary=False):
 level=0;last=0;path=[]
 dx=[100*math.log1p(shock/100)]+[0]*23
 if temporary:dx[6]=-dx[0]
 for i in range(24):
  delta=beta[1]*last+sum(beta[13+j]*(dx[i-j] if i>=j else 0) for j in range(lags+1));level+=delta;last=delta;path.append(100*math.expm1(level/100))
 return {'monthlyPct':path,'yearOneAveragePct':statistics.mean(path[:12]),'yearTwoAveragePct':statistics.mean(path[12:])}

def elasticities(beta,lags,temporary=False):
 level,last,path=0,0,[]
 for month in range(24):
  delta=beta[1]*last
  for lag in range(lags+1):
   impulse=1 if month-lag==0 else -1 if temporary and month-lag==6 else 0
   delta+=beta[13+lag]*impulse
  level+=delta
  last=delta
  path.append(level)
 return path

def bootstrap(rows_,beta,lags,seed,samples=160):
 rng=random.Random(seed)
 x=[r['x'] for r in rows_]
 p=len(beta)
 gram=[[sum(r[i]*r[j] for r in x) for j in range(p)] for i in range(p)]
 columns=[solve(gram,[float(i==j) for i in range(p)]) for j in range(p)]
 inverse=list(map(list,zip(*columns)))
 projection=[[sum(inverse[i][j]*row[j] for j in range(p)) for row in x] for i in range(p)]
 residuals=[r['y']-sum(a*b for a,b in zip(r['x'],beta)) for r in rows_]
 mean=statistics.mean(residuals)
 residuals=[v-mean for v in residuals]
 result={'persistent':[],'temporary':[]}
 for _ in range(samples):
  sampled=[]
  while len(sampled)<len(x):
   start=rng.randrange(len(residuals))
   sampled.extend(residuals[(start+j)%len(residuals)] for j in range(12))
  draw=[beta[i]+sum(w*e for w,e in zip(projection[i],sampled)) for i in range(p)]
  if abs(draw[1])>=0.98:continue
  result['persistent'].append(elasticities(draw,lags))
  result['temporary'].append(elasticities(draw,lags,True))
 if len(result['persistent'])<100:raise ValueError('Too few stable bootstrap draws')
 return result

def baselines(data):
 result=[]
 year=max(r['year'] for r in data['spending'])
 for region in REGIONS.values():
  for commodity in ['oil','gas','electricity']:
   spend=next((r for r in data['spending'] if r['region']==region and r['commodity']==commodity and r['year']==year),None)
   cpi=sorted([r for r in data['cpi'] if r['region']==region and r['commodity']==commodity and r['value'] is not None],key=lambda r:r['month'])
   base=[r['value'] for r in cpi if r['month'].startswith(str(year)+'-')]
   recent=cpi[-12:]
   missing=not spend or spend['value'] is None or len(base)!=12 or len(recent)!=12
   if recent:
    months=[int(r['month'][:4])*12+int(r['month'][-2:]) for r in recent]
    missing=missing or months[-1]-months[0]!=11
   row={'region':region,'commodity':commodity,'spendingYear':year,
        'spendingCategory':next(k for k,v in SPENDING.items() if v==commodity),
        'annualCad':spend['value'] if spend else None,'sourceStatus':spend['status'] if spend else '...',
        'vector':spend['vector'] if spend else None,
        'status':'unavailable' if missing else 'available',
        'cpiBaseYearAverage':statistics.mean(base) if len(base)==12 else None,
        'cpiCurrentAverage':statistics.mean(r['value'] for r in recent) if len(recent)==12 else None,
        'cpiPeriodStart':recent[0]['month'] if recent else None,
        'cpiPeriodEnd':recent[-1]['month'] if recent else None,
        'sourceIds':['statcan-household-energy-spending','statcan-household-energy-cpi']}
   row['currentAnnualCad']=None if missing else row['annualCad']*row['cpiCurrentAverage']/row['cpiBaseYearAverage']
   result.append(row)
 return result

def split_metrics(preds,kind='monthly'):
 summary=metrics(preds,kind)
 return {'development':summary.get('tuning'),'audit':summary.get('holdout')}

def calibrate(data,region,commodity):
 candidates=[]
 for lags in ([3] if commodity=='oil' else [3,6,12]):
  r=rows(data,region,commodity,lags)
  if len(r)<180:continue
  p=predictions(r)
  a=annual(r)
  b=fit([v['x'] for v in r],[v['y'] for v in r])
  candidates.append({'lagMonths':lags,'rows':r,'beta':b,'monthly':split_metrics(p),
                     'annual':split_metrics(a,'annual'),'monthlyPredictions':p,'annualPredictions':a})
 if not candidates:
  return {'region':region,'commodity':commodity,'status':'unavailable','reasons':['No sufficiently long monthly CPI history.']}
 selected=min(candidates,key=lambda c:c['monthly']['development']['mae'])
 beta=selected['beta']
 response_paths={'persistent':elasticities(beta,selected['lagMonths']),'temporary':elasticities(beta,selected['lagMonths'],True)}
 reasons=[]
 for label in ['development','audit']:
  score=selected['monthly'][label]
  if score['n']<60 or score['improvementPct']<10:
   reasons.append(f'Monthly {label} error did not improve by at least 10% over the seasonal autoregressive comparator.')
 if abs(beta[1])>=0.98 or statistics.mean(response_paths['persistent'][:12])<=0:
  reasons.append('The estimated price response is unstable or has an unsupported sign.')
 supported=not reasons
 benchmark='WTI spot price' if commodity=='oil' else 'Henry Hub spot price'
 record={'region':region,'commodity':commodity,'status':'supported' if supported else 'exploratory',
   'benchmark':benchmark,'priceBasis':f'{benchmark} converted to CAD at monthly USD/CAD; fixed exchange rate in scenarios',
   'lagMonths':selected['lagMonths'],'trainingStart':selected['rows'][0]['month'],
   'trainingEnd':selected['rows'][-1]['month'],'trainingRows':len(selected['rows']),
   'coefficients':{'autoregressive':beta[1],'benchmarkLags':beta[13:]},
   'responseElasticities':response_paths,
   'responseDraws':bootstrap(selected['rows'],beta,selected['lagMonths'],f'{region}-{commodity}') if supported else None,
   'validation':{k:selected[k] for k in ['monthly','annual','monthlyPredictions','annualPredictions']},
   'candidates':[{'lagMonths':c['lagMonths'],'monthly':c['monthly'],'annual':c['annual']} for c in candidates],
   'reasons':reasons,
   'sourceIds':['statcan-household-energy-cpi','eia-monthly-wti-household' if commodity=='oil' else 'eia-monthly-gas-household','boc-monthly-fx-household','boc-daily-fx-household']}
 return record

def build(cache,offline=False,now=None):
 cache=Path(cache)
 cache.mkdir(parents=True,exist_ok=True)
 stamp=now or datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
 sources=[]
 for source in SOURCES:
  path=cache/source['filename']
  if not offline:
   raw=urlopen(Request(source['downloadUrl'],headers={'User-Agent':'Canada-in-Motion/1.0 research data refresh'}),timeout=180).read()
   if not raw:raise ValueError(f"Empty source {source['id']}")
   path.write_bytes(raw)
  raw=path.read_bytes()
  sources.append({k:v for k,v in source.items() if k!='filename'}|{'sha256':hashlib.sha256(raw).hexdigest()})
 hashes={s['id']:s['sha256'] for s in sources}
 verification_path=cache/'verification.json'
 if offline:
  verification=json.loads(verification_path.read_text())
  if verification['sourceHashes']!=hashes:raise ValueError('Offline source hash changed')
  retrieved=verification['retrievedAt']
 else:
  retrieved=stamp
  verification_path.write_text(json.dumps({'retrievedAt':retrieved,'sourceHashes':hashes},indent=2)+'\n')
 data=parse(cache)
 calibrations=[]
 for region in REGIONS.values():
  for commodity in ['oil','gas']:
   record=calibrate(data,region,commodity)
   calibrations.append(record)
   print(region,commodity,record['status'],flush=True)
 result={'schemaVersion':1,'modelVersion':MODEL_VERSION,'generatedAt':stamp,'retrievedAt':retrieved,
  'sources':sources,'spendingBaselines':baselines(data),'calibrations':calibrations,'observations':data,
  'validation':{'kind':'latest-vintage-expanding-window-conditional-check',
   'specification':'Monthly CPI log change on an intercept, one own-price lag, 11 month indicators, and contemporaneous through lagged CAD benchmark log changes.',
   'oilLagChoice':'Three monthly lags fixed before examining the backtests.',
   'gasLagChoice':'Three, six and twelve monthly lags compared using 2015–2019 monthly MAE only.',
   'acceptance':'At least 60 held-out monthly observations and 10% lower MAE than seasonal AR in each of 2015–2019 and 2020–2025, stable AR coefficient, positive first-year response.',
   'annualCheck':'Each January, fit through the previous December and recursively predict the following twelve CPI levels conditional on observed future benchmark prices. Compare the annual-average level with actual CPI. This check does not validate household dollar bills.',
   'monthlyErrorUnit':'percentage points of monthly log CPI change',
   'annualErrorUnit':'percentage error in annual-average CPI level',
   'parameterInterval':{'method':'Circular 12-month residual-block bootstrap conditional on fitted design','samples':160,'quantiles':[0.05,0.95],'seed':'region-commodity','coverageClaim':'Parameter sensitivity band only. Excludes forecast shocks, policy changes, spending survey error and model misspecification.'}},
  'population':'Mean across all households in each of the ten provinces, including households reporting no spending in the category.',
  'retailScenario':'A specified change in the all-in consumer price index, holding quantities fixed. It is not a change to the wholesale benchmark or just the utility commodity charge.',
  'limitations':[
   'Conditional associations do not identify a causal oil or gas intervention. Taxes, weather, margins and regulation can change the relationship.',
   'The monthly check conditions on observed contemporaneous benchmark prices and past retail CPI. It is not an advance forecast of unknown energy prices.',
   'Historical checks use latest published data, not historical release vintages.',
   'Dollar amounts are price-only spending equivalents based on the latest household-spending survey, updated with a twelve-month CPI average. They are not measured future bills.',
   'Motor-fuel spending includes gas and other fuels for all vehicles and tools. Gasoline CPI is a proxy for that broader spending category.',
   'Monthly spending weights are unavailable. The first-year response averages twelve monthly price effects equally.',
   'A retail electricity or gas scenario changes the all-in consumer price. Commodity tariffs, fixed charges, consumption patterns and benefits require utility-specific billing data.',
   'Territorial households are not represented by this spending table. Suppressed spending remains unavailable.',
   'A six-month temporary scenario reverses the benchmark level after six months. A persistent scenario holds the changed level for the full two-year response.'],
  'literature':[
   {'title':'Oil-Price Shocks and Retail Energy Prices in Canada','author':'Marwan Chacra','year':2002,'url':'https://publications.gc.ca/collections/collection_2014/banque-bank-canada/FB3-2-102-38-eng.pdf'},
   {'title':'User Guide for the Survey of Household Spending, 2023','url':'https://www150.statcan.gc.ca/n1/pub/62f0026m/62f0026m2025001-eng.htm'},
   {'title':'What you pay for at the pump','url':'https://www.bankofcanada.ca/2024/06/what-you-pay-for-at-the-pump/'},
   {'title':'Understanding your electricity bill','url':'https://www.oeb.ca/consumer-information-and-protection/electricity-rates/understanding-your-electricity-bill'},
   {'title':'Understanding your natural gas bill','url':'https://oeb.ca/consumer-information-and-protection/natural-gas-rates/understanding-your-natural-gas-bill'}]}
 content={'modelVersion':MODEL_VERSION,'sourceHashes':hashes,'spendingBaselines':result['spendingBaselines'],'calibrations':calibrations}
 result['dataVersion']=hashlib.sha256(json.dumps(content,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:20]
 return result

def main():
 parser=argparse.ArgumentParser()
 parser.add_argument('--cache',type=Path,default=ROOT/'.data-cache/household-energy')
 parser.add_argument('--output',type=Path,default=ROOT/'data/household-energy-costs.json')
 parser.add_argument('--offline',action='store_true')
 args=parser.parse_args()
 result=build(args.cache,args.offline)
 args.output.parent.mkdir(parents=True,exist_ok=True)
 temporary=args.output.with_suffix('.tmp')
 temporary.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
 temporary.replace(args.output)
 print(json.dumps({'dataVersion':result['dataVersion'],'calibrations':len(result['calibrations']),'supported':sum(r['status']=='supported' for r in result['calibrations'])}))

if __name__=='__main__':
 main()
