import argparse, csv, gzip, io, json, math, hashlib, zipfile
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
INPUT=ROOT/'research/broad-gdp-2026-10'
CODES=dict(zip(['Newfoundland and Labrador','Prince Edward Island','Nova Scotia','New Brunswick','Quebec','Ontario','Manitoba','Saskatchewan','Alberta','British Columbia'],['NL','PE','NS','NB','QC','ON','MB','SK','AB','BC']))
REGIONS=list(CODES.values())
NAMES=['pooled-ridge-1','pooled-ridge-10','pooled-pcr-2','pooled-quadratic-10','equal-four-models']
SPECS={
 'manufacturing':('16100048',{'North American Industry Classification System (NAICS)':'Manufacturing [31-33]','Principal statistics':'Sales of goods manufactured (shipments)','Seasonal adjustment':'Seasonally adjusted'},'Dollars','thousands'),
 'cpi':('18100004',{'Products and product groups':'All-items'},'2002=100','units'),
 'employment':('14100287',{'Labour force characteristics':'Employment','Gender':'Total - Gender','Age group':'15 years and over','Statistics':'Estimate','Data type':'Seasonally adjusted'},'Persons in thousands','thousands'),
 'unemployment':('14100287',{'Labour force characteristics':'Unemployment rate','Gender':'Total - Gender','Age group':'15 years and over','Statistics':'Estimate','Data type':'Seasonally adjusted'},'Percent','units')}
COUNTS={}
def near(a,b,label):
 if a is None or b is None: assert a is b,(label,a,b)
 else: assert math.isclose(float(a),float(b),rel_tol=1e-9,abs_tol=1e-9),(label,a,b)
 COUNTS['numericComparisons']=COUNTS.get('numericComparisons',0)+1

def read_monthly(raw_dir=None):
 source=json.loads(gzip.decompress((INPUT/'inputs/selected-series.json.gz').read_bytes()))
 frozen=json.loads((INPUT/'source-audit.json').read_text())['sources']
 if raw_dir is None:
  values={m:{(r['region'],r['month']):r['value'] if r['status']=='available' else None for r in source[m]} for m in SPECS}
  for metric,index in values.items():
   assert len(index)==len(source[metric]), ('Duplicate source observations',metric)
   assert len(index)==frozen[metric]['rows']
  return values,{SPECS[m][0]:frozen[m]['sha256'] for m in SPECS}
 output={m:{} for m in SPECS}; receipts={}
 for table in dict.fromkeys(s[0] for s in SPECS.values()):
  path=raw_dir/(table+'-eng.zip');receipts[table]=hashlib.sha256(path.read_bytes()).hexdigest()
  expected=next(frozen[m]['sha256'] for m in SPECS if SPECS[m][0]==table)
  assert receipts[table]==expected, ('Archive vintage differs',table)
  with zipfile.ZipFile(path) as archive, archive.open(table+'.csv') as handle:
   for row in csv.DictReader(io.TextIOWrapper(handle,encoding='utf-8-sig')):
    if row['GEO'] not in CODES: continue
    for metric,(t,dimensions,unit,scale) in SPECS.items():
     if t!=table or any(row[k]!=v for k,v in dimensions.items()):continue
     assert row['UOM']==unit and row['SCALAR_FACTOR']==scale
     key=CODES[row['GEO']],row['REF_DATE'];assert key not in output[metric]
     ok=row['VALUE'] and not ({row['STATUS'],row['SYMBOL']}&{'x','F','..','...'})
     output[metric][key]=float(row['VALUE']) if ok else None
 for metric, values in output.items():
  assert len(values)==len(source[metric])
  for row in source[metric]:near(values[row['region'],row['month']],row['value'],('source',metric,row['region'],row['month']))
 return output,receipts

def growth(gdp,r,y):
 a,b=gdp.get((r,y)),gdp.get((r,y-1))
 return 100*(a/b-1) if a is not None and b is not None else None

def features(gdp,monthly,latest):
 out={}
 for r in REGIONS:
  for origin in range(min(y for _,y in gdp)+2,latest+1):
   lag=growth(gdp,r,origin-1)
   if lag is None:continue
   row=[lag]
   for recent in [False,True]:
    for metric in ['employment','unemployment','manufacturing','cpi']:
     end=9 if metric in ('employment','unemployment') else 7
     months=range(end-2,end+1) if recent else range(1,end+1)
     now=[monthly[metric].get((r,f'{origin}-{m:02d}')) for m in months]
     then=[monthly[metric].get((r,f'{origin-1}-{m:02d}')) for m in months]
     if any(x is None for x in now+then):value=None
     elif metric=='unemployment':value=float(np.mean(now)-np.mean(then))
     elif sum(then)<=0:value=None
     else:value=100*(sum(now)/sum(then)-1)
     row.append(value)
   out[r,origin]=row
 return out

def regress(x,y,group,penalty):
 group=np.asarray(group);x=np.asarray(x);y=np.asarray(y)
 centres={p:x[group==p].mean(0) for p in set(group)}
 intercepts={p:y[group==p].mean() for p in set(group)}
 xc=x-np.array([centres[p] for p in group]);yc=y-np.array([intercepts[p] for p in group])
 scale=np.sqrt((xc**2).mean(0));scale=np.where(scale==0,1,scale)
 z=xc/scale
 beta=np.linalg.lstsq(np.vstack((z,np.sqrt(len(y)*penalty)*np.eye(x.shape[1]))),np.r_[yc,np.zeros(x.shape[1])],rcond=None)[0]
 return lambda r,v:float(intercepts[r]+((np.asarray(v)-centres[r])/scale)@beta)

def incumbent(gdp,fs):
 rows=[]
 for horizon in [0,1]:
  eligible=[(r,o,growth(gdp,r,o+horizon),[x[0],x[1]]) for (r,o),x in fs.items() if x[1] is not None and growth(gdp,r,o+horizon) is not None]
  for region in REGIONS:
   prior=[]
   for origin in sorted(o for r,o in fs if r==region and fs[r,o][1] is not None):
    train=[t for t in eligible if t[1]+horizon<origin];own=[t for t in train if t[0]==region]
    if len(own)<10:continue
    x=[fs[region,origin][0],fs[region,origin][1]]
    c={'historical-mean':float(np.mean([t[2] for t in own]))}
    for name,subset,cols in [('shrunk-autoregression',own,[0]),('employment-bridge',own,[0,1]),('pooled-employment-bridge',train,[0,1])]:
     fit=regress([[t[3][i] for i in cols] for t in subset],[t[2] for t in subset],[t[0] for t in subset],1)
     c[name]=fit(region,[x[i] for i in cols])
    known=[t for t in prior if t['targetYear']<origin]
    selected='historical-mean'
    if len(known)>=5:
     scores={n:float(np.mean([abs(t['candidates'][n]-t['actualPct']) for t in known])) for n in c};best=min(scores,key=scores.get)
     if scores[best]<.95*scores['historical-mean']:selected=best
    row={'region':region,'horizon':horizon,'originYear':origin,'targetYear':origin+horizon,'actualPct':growth(gdp,region,origin+horizon),'baselinePct':c[selected],'baselineModel':selected,'candidates':c,'baselineRadius':radius(known,'baselinePct')}
    rows.append(row)
    if row['actualPct'] is not None:prior.append(row)
 return rows

def radius(prior,key):
 if len(prior)<5:return None
 errors=sorted(abs(r[key]-r['actualPct']) for r in prior)
 return errors[min(len(errors)-1,math.ceil(.8*(len(errors)+1))-1)]

def fit_broad(train):
 usable={p for p in REGIONS if len({r['target'] for r in train if r['region']==p})>=10}
 data=[r for r in train if r['region'] in usable]
 if not data:return None
 group=np.array([r['region'] for r in data]);x=np.array([r['x'] for r in data]);y=np.array([r['y'] for r in data])
 means={r:x[group==r].mean(0) for r in usable};ym={r:y[group==r].mean() for r in usable}
 dx=x-np.array([means[r] for r in group]);dy=y-np.array([ym[r] for r in group]);sc=np.sqrt((dx**2).mean(0));sc=np.where(sc==0,1,sc);z=dx/sc
 n=len(y)
 def ls(a,lam):return np.linalg.lstsq(np.vstack((a,np.sqrt(n*lam)*np.eye(a.shape[1]))),np.r_[dy,np.zeros(a.shape[1])],rcond=None)[0]
 b1,b10=ls(z,1),ls(z,10)
 _,_,vt=np.linalg.svd(z[:,1:],full_matrices=False);loading=vt[:2].T
 pcr=np.column_stack((z[:,0],z[:,1:]@loading));psc=np.sqrt((pcr**2).mean(0));psc=np.where(psc==0,1,psc);bp=ls(pcr/psc,1)
 clipped=np.minimum(5,np.maximum(-5,z));quad=np.column_stack((clipped,clipped**2));qm={r:quad[group==r].mean(0) for r in usable};qc=quad-np.array([qm[r] for r in group]);qsc=np.sqrt((qc**2).mean(0));qsc=np.where(qsc==0,1,qsc);bq=ls(qc/qsc,10)
 def prediction(r,x):
  if r not in usable:return {}
  zz=(np.array(x)-means[r])/sc;pp=np.r_[zz[0],zz[1:]@loading]/psc;cl=np.minimum(5,np.maximum(-5,zz));qq=(np.r_[cl,cl**2]-qm[r])/qsc
  vals=[float(ym[r]+zz@b1),float(ym[r]+zz@b10),float(ym[r]+pp@bp),float(ym[r]+qq@bq)];return dict(zip(NAMES,vals+[float(np.mean(vals))]))
 return prediction,{'rows':n,'provinces':len(usable),'maxTarget':max(r['target'] for r in data),'ownYears':{r:len({t['target'] for t in data if t['region']==r}) for r in usable}}

def replay(gdp,fs):
 rows=incumbent(gdp,fs);cache={}
 for row in rows:
  h,o,r=row['horizon'],row['originYear'],row['region']
  if (h,o) not in cache:
   training=[{'region':p,'origin':year,'target':year+h,'x':v,'y':growth(gdp,p,year+h)} for (p,year),v in fs.items() if None not in v and year+h<o and growth(gdp,p,year+h) is not None]
   cache[h,o]=fit_broad(training)
  fitted=cache[h,o];row['candidatePredictions']=fitted[0](r,fs[r,o]) if fitted and None not in fs[r,o] else {};row['training']=fitted[1] if fitted else None
 for row in sorted(rows,key=lambda r:(r['horizon'],r['region'],r['originYear'])):
  prior=[p for p in rows if p['region']==row['region'] and p['horizon']==row['horizon'] and p['targetYear']<row['originYear'] and p['actualPct'] is not None]
  scores={}
  for name in NAMES:
   if name not in row['candidatePredictions']:continue
   eligible=[p for p in prior if name in p['candidatePredictions']]
   if len({p['targetYear'] for p in eligible})<5:continue
   cand=np.array([p['candidatePredictions'][name]-p['actualPct'] for p in eligible]);base=np.array([p['baselinePct']-p['actualPct'] for p in eligible])
   if np.abs(cand).mean()<=.95*np.abs(base).mean() and (cand**2).mean()<=(base**2).mean():scores[name]={'mae':float(np.abs(cand).mean()),'baselineMae':float(np.abs(base).mean()),'count':len(eligible),'maxTargetYear':max(p['targetYear'] for p in eligible)}
  selection=min(scores,key=lambda n:scores[n]['mae']) if scores else 'incumbent';row['selected']=selection;row['selectionScores']=scores;row['policyPct']=row['baselinePct'] if selection=='incumbent' else row['candidatePredictions'][selection]
  row['radius']=radius(prior,'policyPct');row['calibrationCount']=len(prior);row['calibrationMaxTargetYear']=max((p['targetYear'] for p in prior),default=None)
 return rows

def metrics(rows,key):
 errors=np.array([r[key]-r['actualPct'] for r in rows]);return {'count':len(rows),'mae':float(abs(errors).mean()),'rmse':float(np.sqrt((errors**2).mean())),'bias':float(errors.mean())}

def intervals(rows,key,width):
 use=[r for r in rows if r[width] is not None];r=np.array([v[width] for v in use]);e=np.abs([v[key]-v['actualPct'] for v in use]);return {'count':len(use),'coverage':float(np.mean(e<=r)),'meanWidth':float(2*r.mean()),'meanIntervalScore':float(np.mean(2*r+10*np.maximum(0,e-r)))}

def compare(rows,published):
 a,b=metrics(rows,'baselinePct'),metrics(rows,'policyPct');ai,bi=intervals(rows,'baselinePct','baselineRadius'),intervals(rows,'policyPct','radius')
 years={y:(metrics([r for r in rows if r['targetYear']==y],'baselinePct'),metrics([r for r in rows if r['targetYear']==y],'policyPct')) for y in range(2015,2026)}
 provinces={p:(metrics([r for r in rows if r['region']==p],'baselinePct'),metrics([r for r in rows if r['region']==p],'policyPct')) for p in REGIONS}
 periods={name:(metrics([r for r in rows if r['targetYear'] in ys],'baselinePct'),metrics([r for r in rows if r['targetYear'] in ys],'policyPct')) for name,ys in [('pandemic',[2020,2021]),('postPandemic',[2022,2023,2024,2025])]}
 gain=100*(1-b['mae']/a['mae']);gates={'complete':len(rows)==110,'mae':gain>=5,'rmse':b['rmse']<=a['rmse'],'years':sum(y['mae']<=x['mae'] for x,y in years.values())>=7,'provinces':all(y['mae']<=x['mae']+.25 for x,y in provinces.values()),'pandemic':periods['pandemic'][1]['mae']<=periods['pandemic'][0]['mae'],'postPandemic':periods['postPandemic'][1]['mae']<=periods['postPandemic'][0]['mae'],'intervalPairs':all((r['radius'] is None)==(r['baselineRadius'] is None) for r in rows),'intervalCoverage':bi['coverage']>=ai['coverage']-.02,'intervalScore':bi['meanIntervalScore']<=ai['meanIntervalScore']}
 for label,value in [('incumbent',a),('policy',b),('incumbentIntervals',ai),('policyIntervals',bi)]:
  for k,v in value.items():near(v,published[label][k],(label,k))
 for label,groups,key in [('byYear',years,'year'),('byProvince',provinces,'region')]:
  for output in published[label]:
   pair=groups[output[key]]
   for which,metric in zip(['incumbent','policy'],pair):
    for k,v in metric.items():near(v,output[which][k],(label,output[key],which,k))
 assert gates==published['gates'] and all(gates.values())==published['passed']
 return {'horizon':rows[0]['horizon'],'incumbent':a,'policy':b,'maeGainPct':gain,'incumbentIntervals':ai,'policyIntervals':bi,'gates':gates,'passed':all(gates.values())}

def main():
 parser=argparse.ArgumentParser(description='Independently replay the frozen broader GDP experiment without importing its model.')
 parser.add_argument('--check',action='store_true',help='Verify frozen forecasts, fitting and admission rules (always enabled).')
 parser.add_argument('--raw-dir',type=Path,help='Optionally reparse exact-hash source ZIP archives from this directory.')
 parser.add_argument('--receipt',type=Path,help='Optionally write a new replay receipt without overwriting the frozen one.')
 args=parser.parse_args()
 manifest=json.loads((INPUT/'manifest.json').read_text())
 for name,expected in manifest['files'].items():
  assert hashlib.sha256((INPUT/name).read_bytes()).hexdigest()==expected, ('Frozen file checksum differs',name)
 monthly,receipts=read_monthly(args.raw_dir);snapshot=json.loads(gzip.decompress((INPUT/'inputs/incumbent-before.json.gz').read_bytes()));gdp={(r['region'],r['year']):r['value'] for r in snapshot['history']['gdp'] if r['region'] in REGIONS and r['status']=='available'};fs=features(gdp,monthly,snapshot['forecastOriginYear']);rows=replay(gdp,fs);published=json.loads((INPUT/'results.json').read_text());ix={(r['region'],r['horizon'],r['originYear']):r for r in rows};assert len(ix)==len(published['records'])
 for f in published['features']:
  expected=fs[f['region'],f['originYear']];assert f['complete']==(None not in expected)
  for a,b in zip(expected,f['values'].values()):near(a,b,('feature',f['region'],f['originYear']))
 for p in published['records']:
  key=p['region'],p['horizon'],p['originYear'];r=ix[key]
  for name in ['actualPct','baselinePct','policyPct']:near(r[name],p[name],(key,name))
  assert r['selected']==p['selected'] and r['baselineModel']==p['baselineModel']
  assert set(r['candidatePredictions'])==set(p['candidatePredictions'])
  for name,value in r['candidatePredictions'].items():near(value,p['candidatePredictions'][name],(key,name))
  assert set(r['selectionScores'])==set(p['selectionScores'])
  for name,score in r['selectionScores'].items():
   for k,v in score.items():near(v,p['selectionScores'][name][k],(key,'selection',name,k))
   assert score['maxTargetYear']<r['originYear']
  for pred,width,lo,hi in [('baselinePct','baselineRadius','baselineLowerPct','baselineUpperPct'),('policyPct','radius','lowerPct','upperPct')]:
   near(None if r[width] is None else r[pred]-r[width],p[lo],(key,lo));near(None if r[width] is None else r[pred]+r[width],p[hi],(key,hi))
  assert r['calibrationCount']==p['calibrationCount'] and r['calibrationMaxTargetYear']==p['calibrationMaxTargetYear']
  if r['calibrationMaxTargetYear'] is not None:assert r['calibrationMaxTargetYear']<r['originYear']
  tr=r['training'];assert tr['maxTarget']<r['originYear'] and tr['rows']==p['trainingRows'] and tr['provinces']==p['trainingProvinces'] and tr['ownYears'].get(r['region'],0)==p['ownTrainingYears']
  assert all(n>=10 for n in tr['ownYears'].values())
 horizons=[compare([r for r in rows if r['horizon']==h and r['targetYear'] in range(2015,2026)],published['horizons'][h]) for h in [0,1]]
 # Mutate later source observations; fixed historical feature windows must not see them.
 changed={m:{k:(v*37+99 if v is not None and int(k[1][5:])>(9 if m in ['employment','unemployment'] else 7) else v) for k,v in values.items()} for m,values in monthly.items()}
 altered=features(gdp,changed,snapshot['forecastOriginYear']);assert fs==altered
 mutated_gdp={k:(v*3.7 if k[1]>=2020 else v) for k,v in gdp.items()};newfs=features(mutated_gdp,monthly,snapshot['forecastOriginYear']);mutated=replay(mutated_gdp,newfs)
 for r in mutated:
  if r['originYear']>2020:continue
  before=ix[r['region'],r['horizon'],r['originYear']];assert before['selected']==r['selected']
  for key in ['baselinePct','policyPct','radius']:near(before[key],r[key],('futureGDPmutation',r['region'],r['originYear'],key))
 result={'passed':True,'independentImplementation':'Augmented least-squares ridge; SVD principal components; independently replayed incumbent and selection; no prototype imports.','sourceVerification':'Original archive parser with frozen-hash verification' if args.raw_dir else 'Checksum-verified frozen selected observations; original raw source review preserved separately','sourceRows':sum(len(v) for v in monthly.values()),'sourceHashes':receipts,'forecastRows':len(rows),'evaluationRows':220,'features':len(fs),'numericComparisons':COUNTS['numericComparisons'],'cutoffMutationPassed':True,'futureGdpMutationPassed':True,'horizons':horizons,'recommendation':'Retain the public incumbent at both horizons; broader policy failed the frozen admission gates.'}
 original=json.loads((INPUT/'independent-review.json').read_text())
 assert result['sourceHashes']==original['sourceHashes'] and result['forecastRows']==original['forecastRows'] and result['features']==original['features']
 for current,previous in zip(result['horizons'],original['horizons']):
  assert current['gates']==previous['gates'] and current['passed']==previous['passed']
  for section in ['incumbent','policy','incumbentIntervals','policyIntervals']:
   for key,value in current[section].items():near(value,previous[section][key],('review receipt',current['horizon'],section,key))
 if args.receipt:
  assert args.receipt.resolve()!=(INPUT/'independent-review.json').resolve(), 'Do not overwrite the frozen receipt.'
  args.receipt.write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result,indent=2))
if __name__=='__main__':main()
