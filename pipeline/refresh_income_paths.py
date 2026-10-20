#!/usr/bin/env python3
"""Publish selected, official provincial input-output multipliers atomically.

No prices are converted into demand shocks. All-provinces and within-province
coefficients are retained separately; bilateral supplier paths are not inferred.
"""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import tempfile
from urllib.request import Request, urlopen
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TABLE = '36100595'
SOURCE_ID = f'statcan-{TABLE}'
URL = f'https://www150.statcan.gc.ca/n1/tbl/csv/{TABLE}-eng.zip'
REGIONS = dict(zip(['NL','PE','NS','NB','QC','ON','MB','SK','AB','BC','YT','NT','NU'], [
    'Newfoundland and Labrador','Prince Edward Island','Nova Scotia','New Brunswick','Quebec',
    'Ontario','Manitoba','Saskatchewan','Alberta','British Columbia','Yukon','Northwest Territories','Nunavut']))
INDUSTRIES = [
    {'id':'oil-gas','label':'Oil and gas extraction (except oil sands)','code':'BS211110','kind':'production'},
    {'id':'oil-sands','label':'Oil sands extraction','code':'BS211140','kind':'production'},
    {'id':'electricity','label':'Electric power generation, transmission and distribution','code':'BS221100','kind':'production'},
    {'id':'gas-distribution','label':'Natural gas distribution','code':'BS221200','kind':'production'},
    {'id':'refining','label':'Petroleum refineries','code':'BS324110','kind':'production'},
    {'id':'oil-pipelines','label':'Crude oil and other pipeline transportation','code':'BS486A00','kind':'production'},
    {'id':'gas-pipelines','label':'Pipeline transportation of natural gas','code':'BS486200','kind':'production'},
    {'id':'oil-gas-services','label':'Support activities for oil and gas extraction','code':'BS21311A','kind':'production'},
    {'id':'oil-gas-construction','label':'Oil and gas engineering construction','code':'BS23C200','kind':'construction'},
    {'id':'electricity-construction','label':'Electric power engineering construction','code':'BS23C300','kind':'construction'},
]
METRICS = {
    'gdp': 'Gross domestic product (GDP) at basic prices',
    'labour': 'Labour income',
    'jobs': 'Jobs',
    'output': 'Output',
}
EFFECTS = {name:f'{name.capitalize()} multiplier' for name in ('direct','indirect','induced','simple','total')}
SCOPES = {'withinProvince':'Within province','canada':'All provinces'}
UNAVAILABLE = {'x':'suppressed','..':'missing','...':'not-applicable','F':'unreliable'}
LIMITATIONS = [
    'This is a final-demand scenario using the production structure and prices of the selected reference year. It is not a response to an oil, gas or electricity price change.',
    'The scenario is additional industry output delivered to final consumption, capital formation or exports. An industry-wide sales total includes intermediate purchases and cannot be substituted without double counting.',
    'Fixed input proportions, import shares and labour requirements assume available capacity. Substitution, price changes, displacement, financing, monetary policy and supply constraints are not modelled.',
    'Rest of Canada is the published all-provinces result minus the within-province result for the originating industry. The table does not identify individual recipient provinces or supplier industries.',
    'GDP and labour income overlap: labour income is part of GDP. Output counts intermediate production and is not GDP. These measures must not be added.',
    'Jobs are employment requirements associated with the scenario, including full-time and part-time jobs; they are not full-time equivalents, permanent jobs or a forecast of net hires.',
    'Induced effects include household spending associated with direct and indirect labour income. Statistics Canada cautions that they tend to overstate impacts within a one-year production cycle; they are excluded by default.',
    'The multipliers are published to three decimal places. Published totals can differ slightly from the sum of their rounded components.',
    'An absent multiplier is unavailable, not a zero impact. Oil and gas extraction combines both fuels and cannot provide an oil-only or gas-only effect.',
]


def parse_rows(rows, last_years=3):
    code_map = {row['code']:row['id'] for row in INDUSTRIES}
    region_map = {name:code for code,name in REGIONS.items()}
    metric_map = {label:key for key,label in METRICS.items()}
    effect_map = {label:key for key,label in EFFECTS.items()}
    scope_map = {label:key for key,label in SCOPES.items()}
    indexed = {}
    years = set()
    for row in rows:
        code = row['Industry'].rsplit('[',1)[-1].rstrip(']')
        if code not in code_map or row['GEO'] not in region_map or row['Variable'] not in metric_map or row['Multiplier type'] not in effect_map:
            continue
        industry = code_map[code]
        expected_label = next(item['label'] for item in INDUSTRIES if item['id'] == industry)
        if row['Industry'] != f'{expected_label} [{code}]':
            raise ValueError(f'Industry definition changed: {code}')
        year = int(row['REF_DATE'])
        years.add(year)
        if row['Geographical coverage'] not in scope_map:
            raise ValueError('Unrecognized geographical coverage')
        metric = metric_map[row['Variable']]
        expected_unit = 'Per million dollars of output' if metric == 'jobs' else 'Per dollar of output'
        if row['UOM'] != expected_unit or row['SCALAR_FACTOR'] != 'units' or row['DECIMALS'] != '3':
            raise ValueError('Multiplier unit, scalar or precision changed')
        key = (year,region_map[row['GEO']],industry,scope_map[row['Geographical coverage']],effect_map[row['Multiplier type']],metric)
        if key in indexed:
            raise ValueError('Duplicate multiplier')
        flag = row['STATUS']
        status = UNAVAILABLE.get(flag)
        if flag not in ('','p','r','0s',*UNAVAILABLE):
            raise ValueError(f'Unrecognized multiplier status {flag}')
        value = None if status or row['VALUE'] == '' else float(row['VALUE'])
        if value is not None and (not math.isfinite(value) or value < 0):
            raise ValueError('Invalid nonnegative multiplier')
        if not row['VECTOR'].startswith('v') or not row['VECTOR'][1:].isdigit():
            raise ValueError('Missing source vector')
        indexed[key] = {'value':value,'status':status or ('available' if value is not None else 'missing'),'vector':row['VECTOR'],'sourceStatus':flag}
    if not years:
        raise ValueError('No selected input-output coefficients')
    years = sorted(years)[-last_years:]
    missing = {'value':None,'status':'not-published','vector':None,'sourceStatus':None}
    observations = []
    for year in years:
        for region in REGIONS:
            for industry in INDUSTRIES:
                effects = {effect:{scope:{metric:indexed.get((year,region,industry['id'],scope,effect,metric),missing.copy())
                    for metric in METRICS} for scope in SCOPES} for effect in EFFECTS}
                observations.append({'year':year,'region':region,'industry':industry['id'],'effects':effects})
    validate_accounting(observations)
    return years, observations


def validate_accounting(observations):
    """Allow published rounding only; do not force rounded components to sum."""
    for row in observations:
        for scope in SCOPES:
            for metric in METRICS:
                values = {effect:row['effects'][effect][scope][metric]['value'] for effect in EFFECTS}
                for total,parts in [('simple',['direct','indirect']),('total',['direct','indirect','induced'])]:
                    if all(values[key] is not None for key in [total,*parts]):
                        tolerance = (len(parts)+1)*0.0005+1e-10
                        if abs(values[total]-sum(values[key] for key in parts)) > tolerance:
                            raise ValueError(f'Multiplier decomposition does not reconcile: {row["region"]}/{row["industry"]}/{metric}/{total}')
        for effect in EFFECTS:
            for metric in METRICS:
                inside = row['effects'][effect]['withinProvince'][metric]['value']
                national = row['effects'][effect]['canada'][metric]['value']
                if inside is not None and national is not None and inside > national+0.001+1e-10:
                    raise ValueError('Within-province effect exceeds all-provinces effect')


def build_snapshot(raw, retrieved_at, released_at):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        metadata = archive.read(f'{TABLE}_MetaData.csv')
        with archive.open(f'{TABLE}.csv') as source:
            years, observations = parse_rows(csv.DictReader(io.TextIOWrapper(source,encoding='utf-8-sig')))
    source = {'id':SOURCE_ID,'title':'Input-output multipliers, provincial and territorial, detail level',
        'publisher':'Statistics Canada','url':f'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid={TABLE}01',
        'downloadUrl':URL,'licence':'Statistics Canada Open Licence','licenceUrl':'https://www.statcan.gc.ca/en/reference/licence',
        'sha256':hashlib.sha256(raw).hexdigest(),'metadataSha256':hashlib.sha256(metadata).hexdigest(),
        'retrievedAt':retrieved_at,'releasedAt':released_at,
        'locator':'Energy industries; direct, indirect, induced, simple and total multipliers; all provinces and within province. Table notes 1–10.'}
    snapshot = {'schemaVersion':1,'method':'published-input-output-final-demand','retrievedAt':retrieved_at,
        'latestYear':max(years),'years':years,'coefficientDecimals':3,'maxDemandMillion':10000,
        'regions':[{'code':code,'name':name} for code,name in REGIONS.items()],
        'industries':INDUSTRIES,'metrics':METRICS,'sources':[source],
        'observations':observations,'limitations':LIMITATIONS,
        'coverage':{'geography':'Originating province or territory, within-province and all-provinces effects',
                    'bilateralRecipients':False,'supplierIndustryPaths':False,'priceResponse':False},
        'attribution':'Source: Statistics Canada. Calculations and presentation by Canada in Motion; this is not an official Statistics Canada product.'}
    stable = {key:value for key,value in snapshot.items() if key not in ('retrievedAt','sources')}
    stable['sourceHash'] = source['sha256']
    snapshot['dataVersion'] = hashlib.sha256(json.dumps(stable,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:20]
    return snapshot


def acquire(cache, offline=False):
    cache.mkdir(parents=True,exist_ok=True)
    archive_path = cache/f'{TABLE}-eng.zip'
    verification_path = cache/'network-verification.json'
    if offline:
        raw = archive_path.read_bytes()
        verification = json.loads(verification_path.read_text())
        if verification.get('sha256') != hashlib.sha256(raw).hexdigest():
            raise ValueError('Offline source verification mismatch')
        for field in ('retrievedAt','releasedAt'):
            if not isinstance(verification.get(field),str) or len(verification[field]) < 10:
                raise ValueError('Offline source verification date unavailable')
    else:
        request = Request('https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata',
            data=json.dumps([{'productId':int(TABLE)}]).encode(),headers={'Content-Type':'application/json','User-Agent':'Canada-in-Motion/1.0 public-data-refresh'})
        with urlopen(request,timeout=60) as response:
            payload = json.load(response)
        if payload[0]['status'] != 'SUCCESS' or payload[0]['object']['productId'] != TABLE:
            raise ValueError('Unrecognized publisher metadata')
        released_at = payload[0]['object']['releaseTime']
        with urlopen(Request(URL,headers={'User-Agent':'Canada-in-Motion/1.0 public-data-refresh'}),timeout=240) as response:
            raw = response.read(192*1024*1024+1)
        if len(raw)>192*1024*1024 or not zipfile.is_zipfile(io.BytesIO(raw)):
            raise ValueError('Unexpected input-output archive')
        verification = {'sha256':hashlib.sha256(raw).hexdigest(),'releasedAt':released_at,
            'retrievedAt':datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')}
        archive_path.write_bytes(raw)
        verification_path.write_text(json.dumps(verification))
    return raw,verification


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir',type=Path,default=ROOT/'.data-cache/income-paths')
    parser.add_argument('--output',type=Path,default=ROOT/'data/income-paths.json')
    parser.add_argument('--offline',action='store_true')
    args = parser.parse_args()
    raw,verification = acquire(args.cache_dir,args.offline)
    snapshot = build_snapshot(raw,verification['retrievedAt'],verification['releasedAt'])
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=args.output.parent,delete=False) as output:
        json.dump(snapshot,output,ensure_ascii=False,separators=(',',':'),allow_nan=False)
        output.write('\n')
        temporary = Path(output.name)
    temporary.replace(args.output)
    print(json.dumps({'file':str(args.output),'dataVersion':snapshot['dataVersion'],'years':snapshot['years'],'records':len(snapshot['observations'])}))


if __name__ == '__main__':
    main()
