import hashlib,json,math,random
from pathlib import Path
import numpy as np
from reconstruct import ROOT,H,G,ols,gdp_rows,fits
report={'sourceHashes':{},'gdpRanges':[],'householdResidualBootstrap':{}}
cache=ROOT/'.data-cache/household-price-research'
files={'statcan-household-energy-cpi':cache/'18100004.zip','statcan-household-energy-spending':cache/'11100222.zip','eia-monthly-wti-household':cache/'wti-monthly.html','eia-monthly-gas-household':cache/'henry-hub-monthly.html','boc-monthly-fx-household':cache/'fx-monthly-legacy.json','boc-daily-fx-household':cache/'fx-current.json','statcan-real-provincial-gdp-history':ROOT/'.data-cache/dynamic-price/gdp-expenditure.zip','eia-annual-wti-history':ROOT/'.data-cache/dynamic-price/wti.html','eia-henry-hub-annual':ROOT/'.data-cache/price-response/henry-hub-annual.html','eia-henry-hub-monthly':ROOT/'.data-cache/price-response/henry-hub-monthly.html'}
for source in H['sources']+G['sources']:
    found=hashlib.sha256(files[source['id']].read_bytes()).hexdigest()
    assert source['sha256']==found,source['id']
    report['sourceHashes'][source['id']]=found
for reg,com,h in [('AB','oil',0),('QC','oil',0),('BC','gas',1)]:
    model=next(r for r in G['models'] if r['region']==reg and r['commodity']==com and r['horizonYears']==h)
    own=gdp_rows(reg,com,h); peers=[row for p in model['fit']['peerRegions'] for row in gdp_rows(p,com,h)]
    years=sorted({r['year'] for r in own}); blocks=[years[i:i+3] for i in range(len(years)-2) if years[i+2]-years[i]==2]
    rng=random.Random(model['parameterRange']['seed']); slopes=[]
    for _ in range(400):
        selected=[]
        while len(selected)<len(years):selected+=rng.choice(blocks)
        selected=selected[:len(years)]
        a=[r for y in selected for r in own if r['year']==y];b=[r for y in selected for r in peers if r['year']==y]
        slopes.append(float(fits(a,b,reg,True)[model['fit']['variant']][-1]))
    slopes.sort(); lo=slopes[math.floor(.1*399)];hi=slopes[math.ceil(.9*399)]
    assert abs(lo-model['parameterRange']['low'])<1e-10 and abs(hi-model['parameterRange']['high'])<1e-10
    report['gdpRanges'].append(dict(region=reg,commodity=com,horizon=h,low=lo,high=hi,replicates=400))
model=next(m for m in H['calibrations'] if m['region']=='AB' and m['commodity']=='oil')
cpi={r['month']:r['value'] for r in H['observations']['cpi'] if r['region']=='AB' and r['commodity']=='oil' and r['value']}
prices=H['observations']['benchmarks']['oil'];months=sorted(set(cpi)&set(prices));x=[];y=[]
for i in range(5,len(months)):
    month=months[i];x.append([1,100*math.log(cpi[months[i-1]]/cpi[months[i-2]])]+[float(int(month[-2:])==m) for m in range(2,13)]+[100*math.log(prices[months[i-j]]['cad']/prices[months[i-j-1]]['cad']) for j in range(4)])
    y.append(100*math.log(cpi[month]/cpi[months[i-1]]))
x=np.array(x);y=np.array(y);beta=ols(x,y);e=y-x@beta;e-=np.mean(e);project=np.linalg.pinv(x);rng=random.Random('AB-oil');maxerror=0
for stored in model['responseDraws']['persistent']:
    sample=[]
    while len(sample)<len(x):
        start=rng.randrange(len(e));sample.extend(e[(start+j)%len(e)] for j in range(12))
    draw=beta+project@np.array(sample[:len(x)]);path=[];level=last=0
    assert abs(draw[1])<.98
    for month in range(24):
        last=draw[1]*last+(draw[13+month] if month<=3 else 0);level+=last;path.append(level)
    maxerror=max(maxerror,float(np.max(np.abs(np.array(path)-np.array(stored)))))
assert maxerror<1e-10
report['householdResidualBootstrap']={'region':'AB','commodity':'oil','draws':len(model['responseDraws']['persistent']),'monthsEach':24,'maxElasticityDifference':maxerror}
(ROOT/'.data-cache/price-impact-review/uncertainty-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
