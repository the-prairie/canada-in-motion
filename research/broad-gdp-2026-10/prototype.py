import argparse
import gzip
import importlib.util
import json
import math
from pathlib import Path
from statistics import mean
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
PROTOCOL=json.loads((OUT/'protocol.json').read_text())
CANDIDATES=PROTOCOL['candidates']
PROVINCES=['NL','PE','NS','NB','QC','ON','MB','SK','AB','BC']
FEATURE_NAMES=PROTOCOL['features']

def load_incumbent():
    spec=importlib.util.spec_from_file_location('independent_incumbent',ROOT/'tests/review/energy-forecast-independent-audit.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    snapshot=json.loads(gzip.decompress((OUT/'inputs/incumbent-before.json.gz').read_bytes()))
    return snapshot,module.reproduce_incumbent(snapshot)

def source_features(snapshot,series):
    index={metric:{(r['region'],r['month']):r['value'] if r['status']=='available' else None for r in rows} for metric,rows in series.items()}
    gdp={(r['region'],r['year']):r['value'] for r in snapshot['history']['gdp'] if r['status']=='available'}
    result={}
    for region in PROVINCES:
        for origin in range(min(y for _,y in gdp)+2,snapshot['forecastOriginYear']+1):
            if any((region,year) not in gdp for year in [origin-1,origin-2]):continue
            values=[100*(gdp[region,origin-1]/gdp[region,origin-2]-1)];windows=[]
            for window in ['ytd','recent']:
                for metric in ['employment','unemployment','manufacturing','cpi']:
                    end=9 if metric in ['employment','unemployment'] else 7
                    start=1 if window=='ytd' else end-2
                    a=[index[metric].get((region,f'{origin}-{m:02d}')) for m in range(start,end+1)]
                    b=[index[metric].get((region,f'{origin-1}-{m:02d}')) for m in range(start,end+1)]
                    value=None if None in a+b or (metric!='unemployment' and sum(b)<=0) else (mean(a)-mean(b) if metric=='unemployment' else 100*(sum(a)/sum(b)-1))
                    values.append(value)
                    windows.append({'metric':metric,'window':window,'fromMonth':start,'throughMonth':end,'currentMean':mean(a) if None not in a else None,'previousMean':mean(b) if None not in b else None,'value':value})
            result[region,origin]={'region':region,'originYear':origin,'values':dict(zip(FEATURE_NAMES,values)),'windows':windows,'complete':None not in values}
    return result

def fit_models(train):
    names=sorted({r['region'] for r in train})
    eligible={region for region in names if len({r['targetYear'] for r in train if r['region']==region})>=10}
    train=[r for r in train if r['region'] in eligible]
    if not train:return None
    x=np.asarray([r['x'] for r in train],dtype=float);y=np.asarray([r['actualPct'] for r in train],dtype=float)
    groups={region:np.asarray([i for i,r in enumerate(train) if r['region']==region]) for region in sorted(eligible)}
    x_mean={r:x[ix].mean(axis=0) for r,ix in groups.items()};y_mean={r:float(y[ix].mean()) for r,ix in groups.items()}
    dx=np.vstack([x[i]-x_mean[row['region']] for i,row in enumerate(train)])
    dy=np.asarray([y[i]-y_mean[row['region']] for i,row in enumerate(train)])
    scale=np.sqrt(np.mean(dx*dx,axis=0));scale[scale==0]=1
    z=dx/scale;n=len(train)
    def solve(matrix,ratio):return np.linalg.solve(matrix.T@matrix+n*ratio*np.eye(matrix.shape[1]),matrix.T@dy)
    linear={name:solve(z,ratio) for name,ratio in [('pooled-ridge-1',1),('pooled-ridge-10',10)]}
    covariance=z[:,1:].T@z[:,1:]/n
    eigenvalues,eigenvectors=np.linalg.eigh(covariance)
    order=np.argsort(eigenvalues)[::-1][:2]
    loadings=eigenvectors[:,order]
    factor=np.column_stack([z[:,0],z[:,1:]@loadings])
    factor_scale=np.sqrt(np.mean(factor*factor,axis=0));factor_scale[factor_scale==0]=1
    pcr=solve(factor/factor_scale,1)
    clipped=np.clip(z,-5,5);expanded=np.column_stack([clipped,clipped*clipped])
    expanded_mean={r:expanded[ix].mean(axis=0) for r,ix in groups.items()}
    expanded_centre=np.vstack([expanded[i]-expanded_mean[row['region']] for i,row in enumerate(train)])
    expanded_scale=np.sqrt(np.mean(expanded_centre*expanded_centre,axis=0));expanded_scale[expanded_scale==0]=1
    quadratic=solve(expanded_centre/expanded_scale,10)
    return {'xMean':x_mean,'yMean':y_mean,'scale':scale,'linear':linear,'loadings':loadings,'factorScale':factor_scale,'pcr':pcr,'expandedMean':expanded_mean,'expandedScale':expanded_scale,'quadratic':quadratic,'trainingRows':n,'trainingProvinces':len(eligible),'trainingMaxTargetYear':max(r['targetYear'] for r in train),'ownTrainingYears':{r:len({x['targetYear'] for x in train if x['region']==r}) for r in eligible}}

def predict(fit,region,inputs):
    if fit is None or region not in fit['xMean']:return {}
    z=(np.asarray(inputs)-fit['xMean'][region])/fit['scale'];intercept=fit['yMean'][region]
    predictions={name:float(intercept+z@beta) for name,beta in fit['linear'].items()}
    factor=np.r_[z[0],z[1:]@fit['loadings']]/fit['factorScale']
    predictions['pooled-pcr-2']=float(intercept+factor@fit['pcr'])
    clipped=np.clip(z,-5,5);expanded=np.r_[clipped,clipped*clipped]
    predictions['pooled-quadratic-10']=float(intercept+((expanded-fit['expandedMean'][region])/fit['expandedScale'])@fit['quadratic'])
    predictions['equal-four-models']=mean(predictions.values())
    assert all(math.isfinite(value) for value in predictions.values())
    return predictions

def radius(prior,field):
    if len(prior)<5:return None
    errors=sorted(abs(row[field]-row['actualPct']) for row in prior)
    return errors[min(len(errors),math.ceil((len(errors)+1)*.8))-1]

def evaluate(snapshot,series,baseline):
    features=source_features(snapshot,series)
    gdp={(r['region'],r['year']):r['value'] for r in snapshot['history']['gdp'] if r['status']=='available'}
    records=[];cache={}
    for key,base in baseline.items():
        region,horizon,origin=key
        feature=features.get((region,origin))
        if (horizon,origin) not in cache:
            train=[]
            for (r,y),old_feature in features.items():
                target=y+horizon
                if target<origin and (r,target) in gdp and (r,target-1) in gdp and old_feature['complete']:
                    train.append({'region':r,'originYear':y,'targetYear':target,'actualPct':100*(gdp[r,target]/gdp[r,target-1]-1),'x':list(old_feature['values'].values())})
            cache[horizon,origin]=fit_models(train)
        fit=cache[horizon,origin]
        candidates=predict(fit,region,list(feature['values'].values())) if feature and feature['complete'] else {}
        records.append({'region':region,'horizon':horizon,'originYear':origin,'targetYear':origin+horizon,'actualPct':base['actualPct'],'baselinePct':base['baselinePct'],'baselineModel':base['incumbentModel'],'baselineLowerPct':base['baselinePct']-base['radius'] if base['radius'] is not None else None,'baselineUpperPct':base['baselinePct']+base['radius'] if base['radius'] is not None else None,'candidatePredictions':candidates,'trainingRows':fit['trainingRows'] if fit else 0,'trainingProvinces':fit['trainingProvinces'] if fit else 0,'trainingMaxTargetYear':fit['trainingMaxTargetYear'] if fit else None,'ownTrainingYears':fit['ownTrainingYears'].get(region,0) if fit else 0})
    records.sort(key=lambda r:(r['horizon'],r['region'],r['originYear']))
    for row in records:
        prior=[r for r in records if r['region']==row['region'] and r['horizon']==row['horizon'] and r['targetYear']<row['originYear'] and r['actualPct'] is not None]
        scores={}
        for name in CANDIDATES:
            if name not in row['candidatePredictions']:continue
            paired=[r for r in prior if name in r['candidatePredictions']]
            if len({r['targetYear'] for r in paired})<5:continue
            a=[r['candidatePredictions'][name]-r['actualPct'] for r in paired];b=[r['baselinePct']-r['actualPct'] for r in paired]
            mae=mean(abs(e) for e in a);bm=mean(abs(e) for e in b)
            if mae<=.95*bm and mean(e*e for e in a)<=mean(e*e for e in b):scores[name]={'mae':mae,'baselineMae':bm,'count':len(paired),'maxTargetYear':max(r['targetYear'] for r in paired)}
        selected=min(scores,key=lambda n:scores[n]['mae']) if scores else 'incumbent'
        row['selectionScores']=scores;row['selected']=selected
        row['policyPct']=row['baselinePct'] if selected=='incumbent' else row['candidatePredictions'][selected]
        width=radius(prior,'policyPct')
        row['lowerPct']=row['policyPct']-width if width is not None else None;row['upperPct']=row['policyPct']+width if width is not None else None
        row['calibrationCount']=len(prior);row['calibrationMaxTargetYear']=max((r['targetYear'] for r in prior),default=None)
    return records,features

def score(rows,name):
    pairs=[(r,r['baselinePct'] if name=='incumbent' else (r['policyPct'] if name=='policy' else r['candidatePredictions'].get(name))) for r in rows]
    pairs=[(r,p) for r,p in pairs if p is not None and r['actualPct'] is not None]
    if not pairs:return None
    errors=[prediction-row['actualPct'] for row,prediction in pairs]
    return {'count':len(errors),'mae':mean(abs(e) for e in errors),'rmse':math.sqrt(mean(e*e for e in errors)),'bias':mean(errors)}

def interval_score(rows,policy):
    lower,upper=('lowerPct','upperPct') if policy else ('baselineLowerPct','baselineUpperPct')
    pairs=[r for r in rows if r[lower] is not None and r['actualPct'] is not None]
    if not pairs:return None
    scores=[r[upper]-r[lower]+10*max(0,r[lower]-r['actualPct'])+10*max(0,r['actualPct']-r[upper]) for r in pairs]
    return {'count':len(pairs),'coverage':mean(r[lower]<=r['actualPct']<=r[upper] for r in pairs),'meanWidth':mean(r[upper]-r[lower] for r in pairs),'meanIntervalScore':mean(scores)}

def comparison(rows):
    a,b=score(rows,'incumbent'),score(rows,'policy')
    return {'incumbent':a,'policy':b,'maeGainPct':100*(1-b['mae']/a['mae']) if a and a['mae'] else None,'changedCount':sum(abs(r['baselinePct']-r['policyPct'])>1e-10 for r in rows),'incumbentIntervals':interval_score(rows,False),'policyIntervals':interval_score(rows,True)}

def summarize(records):
    results=[]
    for horizon in [0,1]:
        sample=[r for r in records if r['horizon']==horizon and r['targetYear'] in PROTOCOL['evaluationTargetYears'] and r['actualPct'] is not None]
        total=comparison(sample)
        by_year=[{'year':year,**comparison([r for r in sample if r['targetYear']==year])} for year in PROTOCOL['evaluationTargetYears']]
        by_province=[{'region':region,**comparison([r for r in sample if r['region']==region])} for region in PROVINCES]
        periods=[{'label':label,**comparison([r for r in sample if r['targetYear'] in years])} for label,years in [('pandemic',[2020,2021]),('post-pandemic',[2022,2023,2024,2025]),('pre-pandemic',range(2015,2020))]]
        gates={'complete':len(sample)==110,'mae':total['maeGainPct']>=5,'rmse':total['policy']['rmse']<=total['incumbent']['rmse'],'years':sum(y['policy']['mae']<=y['incumbent']['mae'] for y in by_year)>=7,'provinces':all(p['policy']['mae']<=p['incumbent']['mae']+.25 for p in by_province),'pandemic':periods[0]['policy']['mae']<=periods[0]['incumbent']['mae'],'postPandemic':periods[1]['policy']['mae']<=periods[1]['incumbent']['mae'],'intervalPairs':all((r['lowerPct'] is None)==(r['baselineLowerPct'] is None) for r in sample),'intervalCoverage':total['policyIntervals']['coverage']>=total['incumbentIntervals']['coverage']-.02,'intervalScore':total['policyIntervals']['meanIntervalScore']<=total['incumbentIntervals']['meanIntervalScore']}
        results.append({'horizon':horizon,**total,'byYear':by_year,'byProvince':by_province,'periods':periods,'candidateScores':{name:score(sample,name) for name in CANDIDATES},'gates':gates,'passed':all(gates.values())})
    return results

def main():
    parser=argparse.ArgumentParser(description='Replay the frozen broader GDP experiment; no production files are changed.')
    parser.add_argument('--check',action='store_true',help='Require exact agreement with the frozen result (the default).')
    parser.add_argument('--output',type=Path,help='Optionally save a regenerated result to a separate file.')
    args=parser.parse_args()
    snapshot,baseline=load_incumbent()
    series=json.loads(gzip.decompress((OUT/'inputs/selected-series.json.gz').read_bytes()))
    records,features=evaluate(snapshot,series,baseline)
    result={'protocol':PROTOCOL,'sources':json.loads((OUT/'source-audit.json').read_text())['sources'],'baselineDataVersion':snapshot['dataVersion'],'originYear':snapshot['forecastOriginYear'],'records':records,'features':list(features.values()),'horizons':summarize(records)}
    if args.check or args.output is None:
        assert result==json.loads((OUT/'results.json').read_text()), 'Frozen experiment results changed.'
    if args.output is not None:
        assert args.output.resolve()!=(OUT/'results.json').resolve(), 'Do not overwrite the frozen result.'
        args.output.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print(json.dumps([{'horizon':h['horizon'],'incumbent':h['incumbent'],'policy':h['policy'],'maeGainPct':h['maeGainPct'],'changedCount':h['changedCount'],'incumbentIntervals':h['incumbentIntervals'],'policyIntervals':h['policyIntervals'],'gates':h['gates'],'passed':h['passed'],'candidateScores':h['candidateScores']} for h in result['horizons']],indent=2))

if __name__=='__main__':main()
