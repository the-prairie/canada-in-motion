#!/usr/bin/env python3
"""Build a small, attributed economic snapshot from publisher observations."""
import argparse
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import tempfile
from datetime import datetime, timezone
from urllib.request import Request, urlopen
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REGIONS = dict(zip(['NL','PE','NS','NB','QC','ON','MB','SK','AB','BC','YT','NT','NU'], [
    'Newfoundland and Labrador','Prince Edward Island','Nova Scotia','New Brunswick','Quebec',
    'Ontario','Manitoba','Saskatchewan','Alberta','British Columbia','Yukon','Northwest Territories','Nunavut']))
CODES = {name: code for code, name in REGIONS.items()} | {'Canada': 'CA'}
SCENARIOS = {'Current Measures':'Current Measures','Higher Scenario':'Higher','Lower Scenario':'Lower','Canada Net-zero':'Canada Net-zero'}
YEARS = list(range(2023, 2051))
CER = 'https://www.cer-rec.gc.ca/open/energy/energyfutures2026/'
FINANCE_URL = 'https://budget.canada.ca/update-miseajour/2026/report-rapport/anx1-en.html'
FINANCE_SHA = 'e897f8f643f11de99159c33886784b70ae330e12d7e308993532c0a87a05767e'
FILES = {
    '36100711-eng.zip': ('statcan-36100711', 'https://www150.statcan.gc.ca/n1/tbl/csv/36100711-eng.zip', '8c5826a9ea2593212d3348a57aee8b2e59f908d0616717696dc121f9d707207f'),
    'benchmark-prices-2026.csv': ('cer-benchmark-prices-2026', CER+'benchmark-prices-2026.csv', '24e1a0fa8e4ce614dd8e15842f2f3dfc43924b2c18f30d689c2f615c985d0273'),
    'end-use-prices-2026.csv': ('cer-end-use-prices-2026', CER+'end-use-prices-2026.csv', '73aa6b977acceaf31c609827c5dbb401a2c22d7621d63cffd775513973b710f2'),
    'end-use-demand-2026.csv': ('cer-end-use-demand-2026', CER+'end-use-demand-2026.csv', 'ec178ec02c3f5560b98056232d1fc9e705f243a31744d557e8a2442a290d70f0'),
    'electricity-generation-2026.csv': ('cer-electricity-generation-2026', CER+'electricity-generation-2026.csv', '096273d0a568aef2b9daceb36cc98c58c53d7b71dd0755cee7bff2841db4068a'),
    'crude-oil-production-2026.csv': ('cer-crude-oil-production-2026', CER+'crude-oil-production-2026.csv', '4db5f82b4e6c791bda3ceaff1a61f9c8f67cc66b39235fc3423f5d8872506309'),
    'natural-gas-production-2026.csv': ('cer-natural-gas-production-2026', CER+'natural-gas-production-2026.csv', '42c4c332e2ba6a17320ae9acf41327856583c5d0482e33ca03695aa9313081c5'),
    'EF2026-data-dictionary.csv': ('cer-dictionary-2026', CER+'EF2026-data-dictionary.csv', 'b0d80a23ab5515df7c402db27536838d4f3bbfe54046bc5ec015550aabf57f7f'),
}
FINANCE_ROWS = {
    'nominalGdpPct': [0.5, 0.6, 0.3, 0.0],
    'nominalGdpBillionCad': [18, 22, 9, 1],
    'realGdpPct': [0.1, 0.1, 0.0, 0.0],
    'federalRevenueBillionCad': [2.6, 3.5, 1.4, 0.0],
    'federalBalanceBillionCad': [2.0, 2.0, 1.1, 0.1],
}
LIMITATIONS = [
    'GDP records value added where production occurs. It does not identify the residence of owners or everyone who benefits.',
    'The national GDP comparison is the sum of 13 provinces and territories at basic prices. It is not expenditure GDP at market prices.',
    'CER scenarios change several assumptions together. Their differences are not the causal effect of changing one price.',
    'Delivered residential price indices compare scenarios in the same year. The source price basis requires reconciliation, so dollar bills are not estimated.',
    'No calibrated provincial GDP, employment, royalty or household-income response to arbitrary commodity prices is included.',
    'Oil sensitivity is a separate national Finance Canada illustration on its 2026 baseline. Do not add it to CER scenario changes or allocate it to provinces.',
    'Missing source combinations remain unavailable. They do not establish zero production or zero cost.',
]


def download(url):
    with urlopen(Request(url, headers={'User-Agent': 'Canada-in-Motion/1.0 data refresh'}), timeout=180) as response:
        return response.read()


def read_csv(raw):
    return list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))


def parse_gdp(raw):
    records = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        with archive.open('36100711.csv') as stream:
            for row in csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig')):
                industry = row['North American Industry Classification System (NAICS)']
                if row['Prices'] != 'Current dollars' or row['GEO'] not in CODES or industry not in ['All industries [T001]', 'Energy sector [T016]']:
                    continue
                if row['UOM'] != 'Dollars' or row['SCALAR_FACTOR'] != 'millions':
                    raise ValueError('GDP unit or scale changed')
                if not row['VALUE'] or row['STATUS'] in ('x', '..', 'F'):
                    continue
                key = (int(row['REF_DATE']), CODES[row['GEO']], 'energy' if industry == 'Energy sector [T016]' else 'total')
                if key in records:
                    raise ValueError('Duplicate GDP observation')
                records[key] = row
    common = [year for year in sorted({key[0] for key in records}) if all((year, code, kind) in records for code in REGIONS for kind in ['energy','total'])]
    if not common:
        raise ValueError('No common current-dollar year for all 13 jurisdictions')
    year = max(common)
    result = []
    for code, name in REGIONS.items():
        energy, total = (records[year, code, kind] for kind in ['energy','total'])
        e, t = float(energy['VALUE']), float(total['VALUE'])
        result.append({'code':code,'name':name,'energy':e,'total':t,'sharePct':e/t*100,
                       'energyVector':energy['VECTOR'],'totalVector':total['VECTOR'],
                       'energyStatus':energy['STATUS'],'totalStatus':total['STATUS']})
    return {'year':year,'unit':'million current CAD at basic prices','sourceId':'statcan-36100711',
            'industry':'Energy sector [T016]','regions':result}


def observation_map(rows, predicate, aggregate=False):
    values = {}
    seen = set()
    for row in rows:
        if int(row['Year']) not in YEARS or not predicate(row):
            continue
        region = CODES.get(row.get('Region','Canada'))
        if not region:
            continue
        scenario = SCENARIOS.get(row['Scenario'])
        if scenario is None:
            raise ValueError('Unknown CER scenario')
        key = (region, scenario, int(row['Year']))
        component = (*key, row.get('Variable')) if aggregate else key
        if component in seen:
            raise ValueError(f'Duplicate CER observation {component}')
        seen.add(component)
        value = float(row['Value'])
        if not math.isfinite(value) or value < 0:
            raise ValueError('Invalid CER observation')
        values[key] = values.get(key, 0) + value if aggregate else value
    return values


def make_metric(id, label, unit, source_id, values, kind='quantity', historical_through=2023, **extra):
    series = []
    for region in ['CA', *REGIONS]:
        for scenario in SCENARIOS.values():
            annual = [values.get((region, scenario, year)) for year in YEARS]
            if any(value is not None for value in annual):
                if any(value is None for value in annual):
                    raise ValueError(f'Partial annual series {id}/{region}/{scenario}')
                series.append({'region':region,'scenario':scenario,'values':annual})
    return {'id':id,'label':label,'unit':unit,'sourceId':source_id,'kind':kind,
            'historicalThrough':historical_through,'series':series,**extra}


def parse_metrics(raws):
    metrics = []
    rows = read_csv(raws['benchmark-prices-2026.csv'])
    for id, variable, label in [
        ('wti','West Texas Intermediate (WTI) - US$/bbl','WTI oil price'),
        ('wcs','Western Canadian Select (WCS) - US$/bbl','WCS oil price'),
        ('brent','Brent - US$/bbl','Brent oil price'),
        ('cls','Canadian Light Sweet (CLS) - US$/bbl','Canadian Light Sweet oil price'),
        ('henry-hub','Henry Hub - US$/MMBtu','Henry Hub natural gas price'),
        ('nit','Nova Inventory Transfer (NIT) - US$/MMBtu','NIT natural gas price')]:
        unit = '2025 US$/MMBtu' if id in ['henry-hub','nit'] else '2025 US$/barrel'
        values = observation_map(rows, lambda row: row['Variable'] == variable)
        metrics.append(make_metric(id,label,unit,'cer-benchmark-prices-2026',values,'benchmark',2024,
                                   scope='benchmark',basisSourceId='cer-dictionary-2026'))
    for id, filename, label, unit, predicate, aggregate, historical in [
        ('oil-production','crude-oil-production-2026.csv','Crude oil production','thousand barrels/day',lambda r:r['Variable']=='Total' and r['Unit']=='Thousand Barrels per day',False,2024),
        ('gas-production','natural-gas-production-2026.csv','Natural gas production','billion cubic feet/day',lambda r:r['Variable']=='Total' and r['Unit']=='Billion Cubic Feet per day',False,2024),
        ('electricity-generation','electricity-generation-2026.csv','Electricity generation','GWh/year',lambda r:r['Type']=='Primary Fuel',True,2023),
        ('end-use-demand','end-use-demand-2026.csv','Total end-use energy demand','PJ/year',lambda r:r['Variable']=='Total End-Use' and r['Sector']=='Total End-Use',False,2023)]:
        values = observation_map(read_csv(raws[filename]),predicate,aggregate)
        metrics.append(make_metric(id,label,unit,FILES[filename][0],values,historical_through=historical))
    rows = read_csv(raws['end-use-prices-2026.csv'])
    for id, fuel in [('electricity-price','Electricity'),('gas-price','Natural Gas')]:
        prices = observation_map(rows,lambda r:r['Variable']==fuel and r['Sector']=='Residential')
        values = {key:(value/prices[key[0],'Current Measures',key[2]]*100 if prices.get((key[0],'Current Measures',key[2]),0)>0 else None) for key,value in prices.items()}
        metrics.append(make_metric(id,f'Residential {fuel.lower()} price index','Current Measures in the same year = 100',
                                   'cer-end-use-prices-2026',values,'priceIndex',2023,sector='Residential',
                                   basisNote='Relative same-year index only. Dictionary lists 2022 C$/GJ; nominal bill conversion has not been validated.'))
    return metrics


def validate_economy(data):
    if data['years'] != YEARS or set(data['scenarios']) != set(SCENARIOS.values()):
        raise ValueError('Unexpected time/scenario domain')
    rows = data['gdp']['regions']
    if len(rows) != 13 or {r['code'] for r in rows} != set(REGIONS):
        raise ValueError('GDP must cover all 13 jurisdictions')
    for row in rows:
        if not 0 <= row['energy'] <= row['total'] or row['total'] <= 0 or abs(row['sharePct'] - row['energy']/row['total']*100)>1e-8:
            raise ValueError('Invalid GDP accounting')
    sources = {s['id'] for s in data['sources']}
    if len(sources) != len(data['sources']) or data['gdp']['sourceId'] not in sources:
        raise ValueError('Invalid source registry')
    for source in data['sources']:
        if not re.fullmatch('[0-9a-f]{64}',source['sha256']) or not source['url'].startswith('https://'):
            raise ValueError('Missing source provenance')
    ids = set()
    for metric in data['metrics']:
        if metric['id'] in ids or metric['sourceId'] not in sources:
            raise ValueError('Duplicate metric or missing source')
        ids.add(metric['id'])
        keys = set()
        for series in metric['series']:
            key = series['region'], series['scenario']
            if key in keys or series['scenario'] not in data['scenarios'] or series['region'] not in ['CA',*REGIONS]:
                raise ValueError('Invalid scenario series key')
            keys.add(key)
            if len(series['values']) != len(YEARS) or any(v is not None and (not math.isfinite(v) or v<0) for v in series['values']):
                raise ValueError('Invalid scenario series')
        if metric['id'] in ['electricity-generation','end-use-demand']:
            if len(keys) != 56:
                raise ValueError('Incomplete national energy series')
            for scenario in SCENARIOS.values():
                national = next(s['values'] for s in metric['series'] if s['region']=='CA' and s['scenario']==scenario)
                provincial = [s['values'] for s in metric['series'] if s['region']!='CA' and s['scenario']==scenario]
                for i, total in enumerate(national):
                    if abs(sum(s[i] for s in provincial)-total)>max(0.02,total*0.00001):
                        raise ValueError('National physical total does not reconcile')
    if data['oilSensitivity']['sourceId'] not in sources:
        raise ValueError('Missing oil sensitivity source')
    return data


def validate_finance_table(raw):
    section = raw.decode().split('Estimated Impact of a 10 per cent Increase in WTI', 1)[1].split('</table>', 1)[0]
    numeric_rows = []
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>', section, re.S):
        cells = [re.sub('<[^>]+>', '', cell).strip() for cell in re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)]
        if cells and all(re.fullmatch(r'-?\d+(?:\.\d+)?', cell) for cell in cells):
            numeric_rows.append([float(cell) for cell in cells])
    if numeric_rows != list(FINANCE_ROWS.values()):
        raise ValueError('Finance Canada oil sensitivity changed; calibration review required')


def build(input_dir=None):
    checked = datetime.now(timezone.utc).isoformat()
    sources, raws = [], {}
    for filename,(id,url,pinned_hash) in FILES.items():
        raw = (Path(input_dir)/filename).read_bytes() if input_dir else download(url)
        sha = hashlib.sha256(raw).hexdigest()
        if input_dir and sha != pinned_hash:
            raise ValueError(f'Offline fixture hash mismatch: {filename}')
        raws[filename] = raw
        statcan = id.startswith('statcan')
        sources.append({'id':id,'publisher':'Statistics Canada' if statcan else 'Canada Energy Regulator',
                        'title':'GDP at basic prices by industry, provinces and territories, table 36-10-0711-01' if statcan else 'CER Energy Futures 2026: ' + ('data dictionary' if filename == 'EF2026-data-dictionary.csv' else filename.replace('-2026.csv','').replace('-',' ')),
                        'url':'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610071101' if statcan else url,
                        'downloadUrl':url,'sha256':sha,'retrievedAt':'2026-10-18' if input_dir else checked,
                        'release':'2026-05-01' if statcan else '2026-03-17',
                        'license':'Statistics Canada Open Licence' if statcan else 'Open Government Licence - Canada',
                        'licenseUrl':'https://www.statcan.gc.ca/en/terms-conditions/open-licence' if statcan else 'https://open.canada.ca/en/open-government-licence-canada'})
    dictionary = raws['EF2026-data-dictionary.csv'].decode('cp1252')
    if '2025 US$' not in dictionary or 'in 2022 dollars terms' not in dictionary:
        raise ValueError('CER monetary basis changed; review before publishing')
    finance_sha = FINANCE_SHA
    if not input_dir:
        finance = download(FINANCE_URL)
        finance_sha = hashlib.sha256(finance).hexdigest()
        validate_finance_table(finance)
    sources.append({'id':'finance-oil-sensitivity','publisher':'Department of Finance Canada',
                    'title':'Spring Economic Update 2026, oil-price sensitivity','url':FINANCE_URL,'downloadUrl':FINANCE_URL,
                    'sha256':finance_sha,'retrievedAt':'2026-10-18' if input_dir else checked,'release':'2026',
                    'license':'Attributed numerical facts from the published sensitivity table',
                    'licenseUrl':'https://www.canada.ca/en/department-finance/corporate/terms-conditions.html',
                    'calibrationCheckedOn':'2026-10-18','offlineCalibration':'Pinned published table values; raw document hash recorded at verification.'})
    sensitivity = {'sourceId':'finance-oil-sensitivity','publishedShockPct':10,'scope':'CA',
                   'baseline':'Finance Canada Spring Economic Update 2026; first and second year after shock',
                   'temporaryDuration':'two quarters',
                   **{duration:{key:row[offset:offset+2] for key,row in FINANCE_ROWS.items()} for duration,offset in [('persistent',0),('temporary',2)]}}
    return validate_economy({'schemaVersion':1,'generatedAt':checked,'years':YEARS,'scenarios':list(SCENARIOS.values()),
                             'regions':[{'code':'CA','name':'Canada'},*[{'code':code,'name':name} for code,name in REGIONS.items()]],
                             'gdp':parse_gdp(raws['36100711-eng.zip']),'metrics':parse_metrics(raws),
                             'oilSensitivity':sensitivity,'sources':sources,'limitations':LIMITATIONS})


def atomic_write(data, target):
    validate_economy(data)
    target = Path(target)
    target.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=target.parent,delete=False) as stream:
        temp = stream.name
        try:
            json.dump(data,stream,ensure_ascii=False,separators=(',',':'),allow_nan=False)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        except BaseException:
            os.unlink(temp)
            raise
    os.replace(temp,target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir',type=Path,help='Verified 18 October 2026 raw research fixtures; no network access')
    parser.add_argument('--output',type=Path,default=ROOT/'data/economy.json')
    args = parser.parse_args()
    data = build(args.input_dir)
    atomic_write(data,args.output)
    print(json.dumps({'output':str(args.output),'gdpYear':data['gdp']['year'],'jurisdictions':len(data['gdp']['regions']),
                      'metrics':len(data['metrics']),'sources':len(data['sources'])}))


if __name__ == '__main__':
    main()
