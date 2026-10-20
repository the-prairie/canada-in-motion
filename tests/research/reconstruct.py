import csv, hashlib, io, json, math, statistics, zipfile
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
(ROOT/'.data-cache/price-impact-review').mkdir(parents=True,exist_ok=True)
H=json.loads((ROOT/'data/household-energy-costs.json').read_text())
G=json.loads((ROOT/'data/provincial-price-response.json').read_text())
report={'versions':{'household':H['dataVersion'],'gdp':G['dataVersion']},'checks':{},'examples':{}}
maxima={}
def same(label,a,b,tol=1e-8):
    error=abs(a-b)
    maxima[label]=max(error,maxima.get(label,0))
    assert error<=tol,(label,a,b,error)
def ols(x,y):
    return np.linalg.lstsq(np.array(x,dtype=float),np.array(y,dtype=float),rcond=None)[0]
def pct(x):return float(100*np.expm1(x/100))

region_names={'NL':'Newfoundland and Labrador','PE':'Prince Edward Island','NS':'Nova Scotia','NB':'New Brunswick','QC':'Quebec','ON':'Ontario','MB':'Manitoba','SK':'Saskatchewan','AB':'Alberta','BC':'British Columbia','YT':'Yukon','NT':'Northwest Territories','NU':'Nunavut'}
gdpcache=ROOT/'.data-cache/dynamic-price/gdp-expenditure.zip'
with zipfile.ZipFile(gdpcache) as z:
    rawgdp=list(csv.DictReader(io.TextIOWrapper(z.open('36100222.csv'),encoding='utf-8-sig')))
rawgdp={(r['GEO'],int(r['REF_DATE'])):r for r in rawgdp if r['Prices']=='Chained (2017) dollars' and r['Estimates']=='Gross domestic product at market prices'}
for r in G['history']['gdp']:
    source=rawgdp[(region_names[r['region']],r['year'])]
    assert source['UOM']=='Dollars' and source['SCALAR_FACTOR']=='millions'
    if r['value'] is not None:same('raw-gdp',r['value'],float(source['VALUE']))
report['checks']['rawGdpRows']=len(G['history']['gdp'])

cpi_names={'oil':'Gasoline','gas':'Natural gas','electricity':'Electricity','heating-oil':'Fuel oil and other fuels'}
hcache=ROOT/'.data-cache/household-price-research'
with zipfile.ZipFile(hcache/'18100004.zip') as z:
    rawcpi={(r['GEO'],r['REF_DATE'],r['Products and product groups']):r for r in csv.DictReader(io.TextIOWrapper(z.open('18100004.csv'),encoding='utf-8-sig')) if r['Products and product groups'] in cpi_names.values() and r['GEO'] in region_names.values()}
with zipfile.ZipFile(hcache/'11100222.zip') as z:
    rawspend={(r['GEO'],int(r['REF_DATE']),r['Household expenditures, summary-level categories']):r for r in csv.DictReader(io.TextIOWrapper(z.open('11100222.csv'),encoding='utf-8-sig')) if r['Statistic']=='Average expenditure per household' and r['GEO'] in region_names.values()}
for r in H['observations']['cpi']:
    source=rawcpi[(region_names[r['region']],r['month'],cpi_names[r['commodity']])]
    assert source['UOM']=='2002=100' and source['SCALAR_FACTOR']=='units'
    if r['value'] is not None:same('raw-cpi',r['value'],float(source['VALUE']))
for r in H['spendingBaselines']:
    source=rawspend[(region_names[r['region']],r['spendingYear'],r['spendingCategory'])]
    assert source['UOM']=='Dollars' and source['SCALAR_FACTOR']=='units'
    if r['annualCad'] is not None:same('raw-spending',r['annualCad'],float(source['VALUE']))
    cpi=sorted([c for c in H['observations']['cpi'] if c['region']==r['region'] and c['commodity']==r['commodity'] and c['value'] is not None],key=lambda c:c['month'])
    base=[c['value'] for c in cpi if c['month'].startswith(str(r['spendingYear'])+'-')]
    recent=[c['value'] for c in cpi[-12:]]
    if r['currentAnnualCad'] is not None:same('reprice-baseline',r['currentAnnualCad'],float(source['VALUE'])*np.mean(recent)/np.mean(base))
report['checks']['rawCpiRows']=len(H['observations']['cpi'])
report['checks']['spendingBaselines']=len(H['spendingBaselines'])

allgdp={r:{o['year']:o['value'] for o in G['history']['gdp'] if o['region']==r and o['value'] is not None} for r in region_names}
def gdp_rows(region,commodity,h):
    prices={r['year']:r['value'] for r in G['history']['prices'] if r['commodity']==commodity}
    vals=allgdp[region]
    return [dict(region=region,year=t,end=t+h,y=100*math.log(vals[t+h]/vals[t-1]),lag=100*math.log(vals[t-1]/vals[t-2]),price=100*math.log(prices[t]/prices[t-1])) for t in sorted(prices) if t-1 in prices and all(y in vals for y in [t-2,t-1,t+h])]
def fits(own,peers,region,with_price):
    columns=['lag','price'] if with_price else ['lag']
    ownb=ols([[1]+[r[c] for c in columns] for r in own],[r['y'] for r in own])
    if len({r['region'] for r in peers})==1:return {'own':ownb}
    names=sorted({r['region'] for r in peers})
    poolb=ols([[float(r['region']==p) for p in names]+[r[c] for c in columns] for r in peers],[r['y'] for r in peers])
    poolb=np.r_[poolb[names.index(region)],poolb[len(names):]]
    return {'own':ownb,'half-pool':.5*(ownb+poolb),'pool':poolb}

gdp_history=0
for model in G['models']:
    reg,com,h=model['region'],model['commodity'],model['horizonYears']
    own=gdp_rows(reg,com,h); peers=[row for p in model['fit']['peerRegions'] for row in gdp_rows(p,com,h)]
    final=fits(own,peers,reg,True)
    same('gdp-final-coefficient',model['coefficient'],final[model['fit']['variant']][-1])
    reconstructed=[]
    for stored in model['heldout']:
        now=next(r for r in own if r['year']==stored['year'])
        earlier=[r for r in own if r['end']<now['year']]
        peertrain=[r for r in peers if r['end']<now['year']]
        models=fits(earlier,peertrain,reg,True); controls=fits(earlier,peertrain,reg,False)
        eligible=[r for r in reconstructed if r['end']<now['year']]
        choose=lambda field,variants:'own' if len(eligible)<5 else min(variants,key=lambda v:np.mean([abs(r[field][v]-r['actual']) for r in eligible]))
        variant=choose('candidates',models); basevariant=choose('baselines',controls)
        assert variant==stored['variant'] and basevariant==stored['baselineVariant']
        predictions={name:pct(b@np.array([1,now['lag'],now['price']])) for name,b in models.items()}
        controls={name:pct(b@np.array([1,now['lag']])) for name,b in controls.items()}
        actual=pct(now['y']); mean=pct(np.mean([r['y'] for r in earlier]))
        same('gdp-heldout-model',stored['modelPct'],predictions[variant]);same('gdp-heldout-actual',stored['actualPct'],actual)
        same('gdp-heldout-ar',stored['baselineArPct'],controls[basevariant]);same('gdp-heldout-mean',stored['baselineMeanPct'],mean)
        reconstructed.append(dict(end=now['end'],actual=actual,candidates=predictions,baselines=controls))
        assert max(r['end'] for r in peertrain)<stored['year']
        gdp_history+=1
    score=model['validation']; actuals=np.array([r['actualPct'] for r in model['heldout']])
    for field,metric in [('modelPct','maePctPoints'),('baselineArPct','baselineArMaePctPoints'),('baselineMeanPct','baselineMeanMaePctPoints')]:
        same('gdp-mae',score[metric],np.mean(np.abs(np.array([r[field] for r in model['heldout']])-actuals)))
report['checks']['gdpModels']=len(G['models']);report['checks']['gdpHeldoutReconstructed']=gdp_history

house_months=0;house_years=0
for model in H['calibrations']:
    if model['status']=='unavailable':continue
    reg,com,lags=model['region'],model['commodity'],model['lagMonths']
    cpi={r['month']:r['value'] for r in H['observations']['cpi'] if r['region']==reg and r['commodity']==com and r['value']}
    prices=H['observations']['benchmarks'][com]
    months=sorted(set(cpi)&set(prices)); rows=[]
    for i in range(lags+2,len(months)):
        dates=months[i-lags-2:i+1]
        serial=[int(m[:4])*12+int(m[-2:]) for m in dates]
        if any(b-a!=1 for a,b in zip(serial,serial[1:])):continue
        month=months[i];prev=months[i-1]
        y=100*math.log(cpi[month]/cpi[prev]); lag=100*math.log(cpi[prev]/cpi[months[i-2]])
        base=[1,lag]+[float(int(month[-2:])==m) for m in range(2,13)]
        x=base+[100*math.log(prices[months[i-j]]['cad']/prices[months[i-j-1]]['cad']) for j in range(lags+1)]
        rows.append(dict(month=month,x=x,base=base,y=y,cpi=cpi[month],previous=cpi[prev]))
    beta=ols([r['x'] for r in rows],[r['y'] for r in rows])
    same('house-ar',model['coefficients']['autoregressive'],beta[1])
    for a,b in zip(model['coefficients']['benchmarkLags'],beta[13:]):same('house-price-coef',a,b)
    for stored in model['validation']['monthlyPredictions']:
        i=next(i for i,r in enumerate(rows) if r['month']==stored['month']);train=rows[:i]
        b=ols([r['x'] for r in train],[r['y'] for r in train]);a=ols([r['base'] for r in train],[r['y'] for r in train])
        same('house-monthly-model',stored['model'],b@np.array(rows[i]['x']));same('house-monthly-baseline',stored['baseline'],a@np.array(rows[i]['base']))
        same('house-monthly-actual',stored['actual'],rows[i]['y']); assert max(r['month'] for r in train)<stored['month'];house_months+=1
    for stored in model['validation']['annualPredictions']:
        i=next(i for i,r in enumerate(rows) if r['month']==str(stored['year'])+'-01'); train=rows[:i];future=rows[i:i+12]
        assert len(future)==12 and future[-1]['month']==str(stored['year'])+'-12'
        predicted=[]
        for field in ['x','base']:
            b=ols([r[field] for r in train],[r['y'] for r in train]); last=train[-1]['y'];level=future[0]['previous'];path=[]
            for r in future:
                x=r[field][:];x[1]=last;last=float(b@np.array(x));level*=math.exp(last/100);path.append(level)
            predicted.append(np.mean(path))
        actual=np.mean([r['cpi'] for r in future])
        same('house-annual-model',stored['model'],predicted[0]);same('house-annual-baseline',stored['baseline'],predicted[1]);same('house-annual-actual',stored['actual'],actual)
        same('house-annual-error',stored['modelErrorPct'],100*(predicted[0]/actual-1));house_years+=1
    path=[];level=last=0
    for month in range(24):
        impulse=beta[13+month] if month<=lags else 0
        last=beta[1]*last+impulse;level+=last;path.append(level)
    for a,b in zip(model['responseElasticities']['persistent'],path):same('house-response',a,b)
    if reg=='AB' and com=='oil':
        effect=float(np.mean(100*np.expm1(np.array(path[:12])*math.log(.9))))
        base=next(r['currentAnnualCad'] for r in H['spendingBaselines'] if r['region']==reg and r['commodity']==com)
        report['examples']['AB oil minus10']={'retailPct':effect,'annualSpendingEquivalentCad':base*effect/100,'monthlyEquivalentCad':base*effect/1200,'annualAuditMAPE':model['validation']['annual']['audit']['mae'],'annualDevelopmentMAPE':model['validation']['annual']['development']['mae'],'annualDevelopmentComparatorMAPE':model['validation']['annual']['development']['baselineMae']}
report['checks']['householdMonthlyPredictions']=house_months;report['checks']['householdAnnualPredictions']=house_years
report['maxAbsoluteNumericalDifference']=maxima
report['numericalVerdict']='All reconstructed observations, predictions, scores and selected response paths agree within 1e-8.'
(ROOT/'.data-cache/price-impact-review/numerical-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
