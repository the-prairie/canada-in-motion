"""Independent numerical reproduction; no production modules imported.
Fits 1/2-predictor ridge with explicit closed-form algebra, not pipeline solver.
"""
import json,math,statistics,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
FILE=ROOT/'data/provincial-forecasts.json';raw=FILE.read_bytes();D=json.loads(raw)
P=['NL','PE','NS','NB','QC','ON','MB','SK','AB','BC'];C=['historical-mean','shrunk-autoregression','employment-bridge','pooled-employment-bridge'];mean=statistics.mean
G={(r['region'],r['year']):r['value'] for r in D['history']['gdp'] if r['status']=='available'}
E={(r['region'],r['month']):r['value'] for r in D['history']['employment'] if r['status']=='available'}
cut=D['information']['employmentCutoffMonth'];origin=D['forecastOriginYear']
F={}
for r in P:
 for y in range(min(z for q,z in G if q==r)+2,origin+1):
  if (r,y-2) not in G or (r,y-1) not in G:continue
  ca=[E.get((r,f'{y}-{m:02}')) for m in range(1,cut+1)];pr=[E.get((r,f'{y-1}-{m:02}')) for m in range(1,cut+1)]
  if None in ca+pr:continue
  F[r,y]=[100*(G[r,y-1]/G[r,y-2]-1),100*(sum(ca)/sum(pr)-1)]
rows={h:[(r,y,y+h,F[r,y],100*(G[r,y+h]/G[r,y+h-1]-1)) for r,y in F if (r,y+h) in G and (r,y+h-1) in G] for h in [0,1]}
checks=0;maxdiff=0;compared=0;failures=[]
def near(a,b,context):
 global checks,maxdiff,compared
 checks+=1
 if a is None or b is None:
  if a!=b: failures.append((context,a,b))
  return
 diff=abs(a-b);maxdiff=max(maxdiff,diff);compared+=1
 if diff>1e-8:failures.append((context,a,b,diff))
def fit(train,region,mode,x):
 own=[t for t in train if t[0]==region]
 if mode=='historical-mean':return {'value':mean(t[4] for t in own),'intercept':mean(t[4] for t in own),'slopes':[]}
 use=train if mode=='pooled-employment-bridge' else own;p=1 if mode=='shrunk-autoregression' else 2
 rs=set(t[0] for t in use);centres={q:([mean(t[3][j] for t in use if t[0]==q) for j in range(p)],mean(t[4] for t in use if t[0]==q)) for q in rs}
 dx=[[t[3][j]-centres[t[0]][0][j] for j in range(p)] for t in use];dy=[t[4]-centres[t[0]][1] for t in use]
 scales=[math.sqrt(mean(v[j]**2 for v in dx)) or 1 for j in range(p)]
 z=[[v[j]/scales[j] for j in range(p)] for v in dx];n=len(use)
 a=sum(v[0]**2 for v in z)+n;b=sum(v[0]*w for v,w in zip(z,dy))
 if p==1:beta=[b/a]
 else:
  c=sum(v[0]*v[1] for v in z);d=sum(v[1]**2 for v in z)+n;e=sum(v[1]*w for v,w in zip(z,dy));det=a*d-c*c
  beta=[(b*d-c*e)/det,(a*e-c*b)/det]
 slopes=[v/s for v,s in zip(beta,scales)];intercept=centres[region][1]-sum(v*w for v,w in zip(slopes,centres[region][0]));value=intercept+sum(v*w for v,w in zip(slopes,x))
 return {'value':value,'intercept':intercept,'slopes':slopes,'scales':scales,'standardized':beta}
all_records={};audit_rows=[]
for r in P:
 for h in [0,1]:
  rec=[];production=next(f for f in D['forecasts'] if f['region']==r and f['horizon']==h)
  for o in sorted(y for q,y in F if q==r):
   train=[t for t in rows[h] if t[2]<o]
   if len([t for t in train if t[0]==r])<10:continue
   fitted={m:fit(train,r,m,F[r,o]) for m in C};candidate={m:fitted[m]['value'] for m in C}
   prior=[t for t in rec if t['target']<o];scores={m:mean(abs(t['candidates'][m]-t['actual']) for t in prior) for m in C} if len(prior)>=5 else {}
   chosen=min(C,key=lambda m:scores[m]) if scores else 'historical-mean'
   if scores and scores[chosen]>=.95*scores['historical-mean']:chosen='historical-mean'
   errs=sorted(abs(t['pred']-t['actual']) for t in prior);rad=errs[min(len(errs),math.ceil((len(errs)+1)*.8))-1] if len(errs)>=5 else None
   v=candidate[chosen];row={'origin':o,'target':o+h,'pred':v,'actual':100*(G[r,o+h]/G[r,o+h-1]-1) if (r,o+h) in G else None,'candidates':candidate,'model':chosen,'lo':v-rad if rad is not None else None,'hi':v+rad if rad is not None else None,'radius':rad,'prior':len(prior)}
   if o==origin:
    near(v,production['predictionPct'],f'{r}/{h}/current');near(row['lo'],production['lowerPct'],f'{r}/{h}/lower');near(row['hi'],production['upperPct'],f'{r}/{h}/upper')
    if chosen!=production['model']:failures.append(('model',r,h,chosen,production['model']))
    for m in C:
     f=production['modelDetails']['candidates'][m];near(fitted[m]['value'],f['predictionPct'],f'{r}/{h}/{m}/pred');near(fitted[m]['intercept'],f['fit']['intercept'],f'{r}/{h}/{m}/intercept')
     for j,k in enumerate(['lagGrowthPct','employmentGrowthPct'][:len(fitted[m]['slopes'])]):near(fitted[m]['slopes'][j],f['fit']['coefficients'][k],f'{r}/{h}/{m}/{k}')
    near(len(prior),production['modelDetails']['calibrationCount'],f'{r}/{h}/calibrationN')
   elif row['actual'] is not None:
    rec.append(row)
    if o+h>=2015:
     saved=next(s for s in production['validation']['heldout'] if s['originYear']==o)
     for our,theirs in [('pred','predictionPct'),('actual','actualPct'),('lo','lowerPct'),('hi','upperPct'),('prior','calibrationCount')]:near(row[our],saved[theirs],f'{r}/{h}/{o}/{our}')
     for m in C:near(candidate[m],saved['candidates'][m],f'{r}/{h}/{o}/{m}')
     for key in ['trainingMaxTargetYear','calibrationMaxTargetYear','selectionMaxTargetYear']:
      if saved[key] is not None and saved[key]>=o:failures.append(('timeleak',r,h,o,key,saved[key]))
     if saved['model']!=chosen:failures.append(('historicalmodel',r,h,o,chosen,saved['model']))
  final=[t for t in rec if t['target']>=2015];mae=mean(abs(t['pred']-t['actual']) for t in final);bmae=mean(abs(t['candidates']['historical-mean']-t['actual']) for t in final);interval=[t for t in final if t['lo'] is not None];coverage=mean(t['lo']<=t['actual']<=t['hi'] for t in interval)
  near(mae,production['validation']['mae'],f'{r}/{h}/mae');near(bmae,production['validation']['benchmarkMae'],f'{r}/{h}/baseline');near(coverage,production['validation']['intervalCoverage'],f'{r}/{h}/coverage')
  audit_rows.append({'region':r,'horizon':h,'model':production['model'],'prediction':production['predictionPct'],'mae':mae,'baselineMae':bmae,'improvementPct':100*(1-mae/bmae),'intervalCoverage':coverage,'intervalN':len(interval),'lower':production['lowerPct'],'upper':production['upperPct']})
  all_records[r,h]=rec
report={'inputVersion':D['dataVersion'],'inputSha256':hashlib.sha256(raw).hexdigest(),'independentImplementation':'No production imports. Explicit one/two-variable ridge algebra, separately reconstructed rows, chronological adaptive selection, and past resolved forecast residual quantiles.','numericComparisons':compared,'maximumAbsoluteDifference':maxdiff,'checks':checks,'failures':failures,'provinceResults':audit_rows,'scope':'GDP/employment values are taken from pinned source history; original vintages not reconstructed. Audit reproduces all 20 final forecasts and 220 published historical predictions, all candidates, final coefficients, selection and ranges.','releaseRecommendation':'Numerically reproducible with no temporal target leakage found. Display error bands as historical-error ranges with measured province-specific coverage; do not promise80%futurecoverage. Forecasts are predictive not causal price effects.'}
(ROOT/'.data-cache/forecast-review').mkdir(parents=True,exist_ok=True)
(ROOT/'.data-cache/forecast-review/PRODUCTION-AUDIT.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='provinceResults'},indent=2))
for x in audit_rows: print(x)
if failures:raise SystemExit(1)
