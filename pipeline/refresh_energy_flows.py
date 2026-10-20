#!/usr/bin/env python3
"""Publish official energy trade estimates and physical provincial balances.

Economic origin/destination records are never used to invent physical routes.
Only published values become zero; absent/suppressed observations stay null.
"""
import argparse
import csv
import hashlib
import io
import json
import math
from datetime import datetime, timezone
from pathlib import Path
import tempfile
from urllib.request import Request, urlopen
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REGIONS = dict(zip(['NL','PE','NS','NB','QC','ON','MB','SK','AB','BC','YT','NT','NU'], [
    'Newfoundland and Labrador','Prince Edward Island','Nova Scotia','New Brunswick','Quebec',
    'Ontario','Manitoba','Saskatchewan','Alberta','British Columbia','Yukon','Northwest Territories','Nunavut']))
CODES = {name: code for code, name in REGIONS.items()} | {'International': 'ROW'}
COMMODITIES = [
    {'id':'oil','label':'Crude oil','productCodes':['ENE211104','ENE211106','ENE211107'],
     'definition':'Crude and diluted bitumen, synthetic crude oil and conventional crude oil; excludes refined fuels and natural gas liquids.'},
    {'id':'gas','label':'Natural gas','productCodes':['ENE211102']},
    {'id':'electricity','label':'Electricity','productCodes':['ENE221100']},
]
TABLES = {
    '36100709':'Provincial and territorial trade flows, by detailed product classification, current and constant dollars',
    '25100021':'Electric power, electric utilities and industry, annual supply and disposition',
    '25100016':'Electric power generation, monthly receipts, deliveries and availability',
    '25100029':'Supply and demand of primary and secondary energy in terajoules, annual',
}
LICENCE = 'https://www.statcan.gc.ca/en/reference/licence'
UNAVAILABLE = {'x':'suppressed', '..':'missing', '...':'not-applicable', 'F':'unreliable'}


def rows(raw, table):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        with archive.open(f'{table}.csv') as stream:
            yield from csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig'))


def observation(row, unit, scale, divisor=1, signed=False):
    if row is None:
        return {'value':None,'status':'missing','sourceStatus':None,'vector':None}
    if row['UOM'] != unit or row['SCALAR_FACTOR'] != scale:
        raise ValueError('Source unit or scalar changed')
    flag = row['STATUS']
    status = UNAVAILABLE.get(flag)
    if status or row['VALUE'] == '':
        return {'value':None,'status':status or 'missing','sourceStatus':flag,'vector':row['VECTOR']}
    value = float(row['VALUE']) / divisor
    if not math.isfinite(value) or (value < 0 and not signed):
        raise ValueError('Invalid numeric observation')
    if flag not in ('', 'p', 'r', 'A', 'B', 'C', 'D', 'E', '0s'):
        raise ValueError(f'Unrecognized source status {flag}')
    return {'value':value,'status':'available','sourceStatus':flag,'vector':row['VECTOR']}


def parse_trade(raw):
    wanted = {code for commodity in COMMODITIES for code in commodity['productCodes']}
    indexed = {}
    for row in rows(raw, '36100709'):
        if row['Prices'] != 'Current prices':
            continue
        product = row['Product'].rsplit('[', 1)[-1].rstrip(']')
        if product not in wanted:
            continue
        origin = CODES.get(row['GEO'].removesuffix(', exporting'))
        destination = CODES.get(row['Geography, importing'].removesuffix(', importing'))
        if origin is None or destination is None:
            raise ValueError('Unrecognized trade geography')
        if origin == destination:
            continue
        key = (int(row['REF_DATE']), origin, destination, product)
        if key in indexed:
            raise ValueError('Duplicate trade observation')
        indexed[key] = observation(row, 'Canadian dollars', 'thousands', 1000)
    years = sorted({key[0] for key in indexed})[-3:]
    if not years:
        raise ValueError('No energy trade data')
    observations = []
    for year in years:
        for origin in [*REGIONS, 'ROW']:
            for destination in [*REGIONS, 'ROW']:
                if origin == destination:
                    continue
                for commodity in COMMODITIES:
                    components = [{'productCode':code, **indexed.get((year, origin, destination, code),
                                   observation(None, '', ''))} for code in commodity['productCodes']]
                    available = all(item['value'] is not None for item in components)
                    status = 'available' if available else ('suppressed' if any(item['status']=='suppressed' for item in components) else 'missing')
                    observations.append({'year':year,'origin':origin,'destination':destination,
                        'commodity':commodity['id'],'value':round(sum(item['value'] for item in components), 6) if available else None,
                        'status':status,'components':components})
    return {'latestYear':max(years),'years':years,'unit':'million current CAD','sourceId':'statcan-36100709',
            'measure':'modelled-trade-value','commodities':COMMODITIES,'observations':observations,
            'valuation':{'interprovincial':'Basic prices; excludes taxes and transportation costs.',
                         'international':'Free on Board (FOB); excludes taxes and duties.'},
            'limitations':[
                'Statistics Canada estimates supplier-to-purchaser trade using a supply and use model. These are economic transactions, not measured physical routes.',
                'Origin can be production or inventory sales by producers, wholesalers or retailers. Destination is the purchaser, including production inputs and inventory.',
                'Trade value is gross sales, not GDP, profit, government revenue or a measure of who ultimately benefits.',
                'Detailed estimates can be substantially revised. The three commodities exclude refined fuels, coal and other energy products.',
            ]}


def parse_electricity(raw, annual=False):
    table = '25100021' if annual else '25100016'
    fields = {'Total interprovincial receipts of electricity':'receipts','Total interprovincial deliveries of electricity':'deliveries'} if annual else {
        'Receipts from other provinces':'receipts','Deliveries to other provinces':'deliveries'}
    selected = []
    for row in rows(raw, table):
        component = row['Electric power, components']
        if component not in fields or row['GEO'] not in REGIONS.values() or (annual and row['Estimates'] != 'Electricity quantity'):
            continue
        selected.append(row)
    if not selected:
        raise ValueError('No physical electricity observations')
    period = max(row['REF_DATE'] for row in selected)
    indexed = {}
    for row in selected:
        if row['REF_DATE'] != period:
            continue
        component = row['Electric power, components']
        key = (row['REF_DATE'], CODES[row['GEO']], fields[component])
        if key in indexed:
            raise ValueError('Duplicate physical electricity observation')
        indexed[key] = observation(row, 'Megawatt hours', 'units')
    if not indexed:
        raise ValueError('No physical electricity observations')
    result = []
    for region in REGIONS:
        items = {key:indexed.get((period, region, key), observation(None, '', '')) for key in ['receipts','deliveries']}
        complete = all(item['value'] is not None for item in items.values())
        result.append({'region':region,**{key:item['value'] for key,item in items.items()},
            'netReceipts':items['receipts']['value']-items['deliveries']['value'] if complete else None,
            'statuses':{**{key:item['status'] for key,item in items.items()},'netReceipts':'available' if complete else 'missing'},
            'sourceStatuses':{key:item['sourceStatus'] for key,item in items.items()},
            'vectors':{key:item['vector'] for key,item in items.items()}})
    return {'id':'electricity-annual' if annual else 'electricity-monthly','commodity':'electricity',
            'frequency':'annual' if annual else 'monthly','period':period,'unit':'MWh','sourceId':f'statcan-{table}',
            'measure':'receipts-deliveries','observations':result,
            'publicationStatus':'preliminary' if annual and period=='2025' else 'See source status flags',
            'limitations':['Totals are receipts from and deliveries to all other provinces. The source does not identify the partner province.',
                           'Physical totals and economic trade estimates measure different things and must not be converted into each other.']}


def parse_fuel_balances(raw):
    fuels = {'Crude oil':'oil','Natural gas':'gas'}
    indexed = {}
    for row in rows(raw, '25100029'):
        if row['GEO'] not in REGIONS.values() or row['Fuel type'] not in fuels or row['Supply and demand characteristics'] != 'Inter-regional transfers':
            continue
        key = (row['REF_DATE'], CODES[row['GEO']], fuels[row['Fuel type']])
        if key in indexed:
            raise ValueError('Duplicate physical fuel balance')
        indexed[key] = observation(row, 'Terajoules', 'units', signed=True)
    if not indexed:
        raise ValueError('No physical fuel balances')
    period = max(key[0] for key in indexed)
    series = []
    for commodity in fuels.values():
        records = []
        for region in REGIONS:
            item = indexed.get((period, region, commodity), observation(None, '', ''))
            records.append({'region':region,'receipts':None,'deliveries':None,'netReceipts':item['value'],
                'statuses':{'receipts':'not-published','deliveries':'not-published','netReceipts':item['status']},
                'sourceStatuses':{'netReceipts':item['sourceStatus']},'vectors':{'netReceipts':item['vector']}})
        series.append({'id':f'{commodity}-net-annual','commodity':commodity,'frequency':'annual','period':period,
            'unit':'TJ','sourceId':'statcan-25100029','measure':'net-receipts','observations':records,
            'limitations':['Net inter-regional movement: positive is net receipts; negative is net deliveries. Gross two-way flows and partner provinces are not supplied.',
                           'Suppressed and absent observations remain unavailable. Published balances may include rounding and statistical differences.',
                           *(['This physical crude-oil category includes condensate and pentanes plus. The economic crude-oil trade basket excludes natural gas liquids, so the categories are not directly comparable.'] if commodity=='oil' else [])]})
    return series


def build_snapshot(raws, retrieved_at):
    sources = []
    for table, title in TABLES.items():
        raw = raws[table]
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            metadata_hash = hashlib.sha256(archive.read(f'{table}_MetaData.csv')).hexdigest()
        sources.append({'id':f'statcan-{table}','publisher':'Statistics Canada','title':title,
            'url':f'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid={table}01',
            'downloadUrl':f'https://www150.statcan.gc.ca/n1/tbl/csv/{table}-eng.zip',
            'licence':'Statistics Canada Open Licence','licenceUrl':LICENCE,
            'sha256':hashlib.sha256(raw).hexdigest(),'metadataSha256':metadata_hash,'retrievedAt':retrieved_at})
    snapshot = {'schemaVersion':1,'retrievedAt':retrieved_at,'regions':[{'code':code,'name':name} for code,name in REGIONS.items()],
        'sources':sources,'trade':parse_trade(raws['36100709']),
        'physical':{'series':[parse_electricity(raws['25100021'],True),parse_electricity(raws['25100016']),*parse_fuel_balances(raws['25100029'])]},
        'attribution':'Source: Statistics Canada. Calculations and presentation by Canada in Motion; this is not an official Statistics Canada product.'}
    # Content identity changes on observations or source revisions, not on a repeated fetch timestamp.
    stable = {key:value for key,value in snapshot.items() if key not in ['retrievedAt','sources']}
    stable['sourceHashes'] = {source['id']:source['sha256'] for source in sources}
    snapshot['dataVersion'] = hashlib.sha256(json.dumps(stable,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:20]
    return snapshot


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, default=ROOT/'.data-cache/energy-flows')
    parser.add_argument('--output', type=Path, default=ROOT/'data/energy-flows.json')
    parser.add_argument('--offline', action='store_true', help='Use previously downloaded official ZIP files')
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True,exist_ok=True)
    raws = {}
    retrieved_at = datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    for table in TABLES:
        path = args.cache_dir/f'{table}-eng.zip'
        if args.offline:
            raw = path.read_bytes()
        else:
            url = f'https://www150.statcan.gc.ca/n1/tbl/csv/{table}-eng.zip'
            with urlopen(Request(url,headers={'User-Agent':'Canada-in-Motion/1.0 public-data-refresh'}),timeout=180) as response:
                raw = response.read(32 * 1024 * 1024 + 1)
            if len(raw)>32 * 1024 * 1024:
                raise ValueError('Unexpected source size')
            if not zipfile.is_zipfile(io.BytesIO(raw)):
                raise ValueError('Source response is not a CSV ZIP')
            path.write_bytes(raw)
        raws[table] = raw
    snapshot = build_snapshot(raws,retrieved_at)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=args.output.parent,delete=False) as output:
        json.dump(snapshot,output,ensure_ascii=False,separators=(',',':'),allow_nan=False)
        output.write('\n')
        temporary = Path(output.name)
    temporary.replace(args.output)
    print(json.dumps({'file':str(args.output),'dataVersion':snapshot['dataVersion'],
        'tradeYears':snapshot['trade']['years'],'tradeRecords':len(snapshot['trade']['observations']),
        'physicalPeriods':{series['id']:series['period'] for series in snapshot['physical']['series']}}))


if __name__ == '__main__':
    main()
