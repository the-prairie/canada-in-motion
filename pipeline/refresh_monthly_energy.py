#!/usr/bin/env python3
"""Refresh monthly observed energy activity, separately from annual accounts.

All amounts are published observations. Missing provincial series are not zeros;
Canada is its published aggregate, never the sum of provincial observations.
"""
import argparse
import csv
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
import math
from pathlib import Path
import re
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REGIONS = dict(zip(
    ['CA', 'NL', 'PE', 'NS', 'NB', 'QC', 'ON', 'MB', 'SK', 'AB', 'BC', 'YT', 'NT', 'NU'],
    ['Canada', 'Newfoundland and Labrador', 'Prince Edward Island', 'Nova Scotia',
     'New Brunswick', 'Quebec', 'Ontario', 'Manitoba', 'Saskatchewan', 'Alberta',
     'British Columbia', 'Yukon', 'Northwest Territories', 'Nunavut']))
CODES = {name: code for code, name in REGIONS.items()}
LICENCE = 'https://www.statcan.gc.ca/en/reference/licence'
METADATA_URL = 'https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata'
SPECS = {
    'oil': {
        'table': '25100063', 'label': 'Crude oil production',
        'title': 'Supply and disposition of crude oil and equivalent',
        'definition': 'Crude oil production; excludes equivalent products such as condensate and pentanes plus.',
        'selectors': {'Supply and disposition': 'Crude oil production', 'Units of measure': 'Cubic metres'},
        'unit': 'm³', 'sourceUnit': 'Cubic metres', 'sourceScale': 'units', 'multiplier': 1,
        'excludedGeographies': {'Atlantic provinces'},
    },
    'gas': {
        'table': '25100086', 'label': 'Marketable natural gas production',
        'title': 'Supply and disposition of natural gas, monthly',
        'definition': 'Marketable natural gas production, measured by energy content. Uses the active table’s revised history.',
        'selectors': {'Supply and disposition': 'Marketable production, supply', 'Unit of measure': 'Gigajoules'},
        'unit': 'GJ', 'sourceUnit': 'Gigajoules', 'sourceScale': 'thousands', 'multiplier': 1000,
        'excludedGeographies': set(),
    },
    'electricity': {
        'table': '25100015', 'label': 'Electricity generation',
        'title': 'Electric power generation, monthly generation by type of electricity',
        'definition': 'Electricity generation by utilities and industrial producers, all generation types.',
        'selectors': {
            'Class of electricity producer': 'Total all classes of electricity producer',
            'Type of electricity generation': 'Total all types of electricity generation'},
        'unit': 'MWh', 'sourceUnit': 'Megawatt hours', 'sourceScale': 'units', 'multiplier': 1,
        'excludedGeographies': set(),
    },
}
BASE_COLUMNS = {'REF_DATE', 'GEO', 'DGUID', 'UOM', 'UOM_ID', 'SCALAR_FACTOR', 'SCALAR_ID',
                'VECTOR', 'COORDINATE', 'VALUE', 'STATUS', 'SYMBOL', 'TERMINATED', 'DECIMALS'}
UNAVAILABLE = {'x': 'suppressed', '..': 'missing', '...': 'not-applicable', 'F': 'unreliable'}
AVAILABLE_FLAGS = {'', 'p', 'r', 'A', 'B', 'C', 'D', 'E', '0s'}
MONTH = re.compile(r'^\d{4}-(0[1-9]|1[0-2])$')


def month_window(latest, count=36):
    if not isinstance(latest, str) or not MONTH.fullmatch(latest):
        raise ValueError('Invalid monthly reference period')
    year, month = map(int, latest.split('-'))
    endpoint = year * 12 + month - 1
    return [f'{index // 12:04d}-{index % 12 + 1:02d}' for index in range(endpoint - count + 1, endpoint + 1)]


def source_rows(raw, spec):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        target = f"{spec['table']}.csv"
        if archive.namelist().count(target) != 1:
            raise ValueError('Expected exactly one source CSV')
        if archive.getinfo(target).file_size > 256 * 1024 * 1024:
            raise ValueError('Source CSV exceeds size limit')
        with archive.open(target) as stream:
            reader = csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig'))
            expected = BASE_COLUMNS | set(spec['selectors'])
            if reader.fieldnames is None or len(reader.fieldnames) != len(expected) or set(reader.fieldnames) != expected:
                raise ValueError('Source dimensions or columns changed')
            for row in reader:
                if None in row or any(value is None for value in row.values()):
                    raise ValueError('Malformed source CSV row')
                yield row


def observation(row, spec):
    if row is None:
        return {'value': None, 'status': 'not-reported', 'sourceStatus': None, 'sourceSymbol': None, 'vector': None}
    if row['UOM'] != spec['sourceUnit'] or row['SCALAR_FACTOR'] != spec['sourceScale']:
        raise ValueError('Source unit or scalar changed')
    if not re.fullmatch(r'v[0-9]+', row['VECTOR']):
        raise ValueError('Invalid source vector')
    if row['TERMINATED']:
        raise ValueError('Selected source series was terminated')
    flags = (row['STATUS'], row['SYMBOL'])
    if any(flag not in AVAILABLE_FLAGS and flag not in UNAVAILABLE for flag in flags):
        raise ValueError('Unrecognized source status or symbol')
    if all(flags) and flags[0] != flags[1]:
        raise ValueError('Conflicting source status and symbol')
    flag = flags[0] or flags[1]
    result = {'sourceStatus': row['STATUS'], 'sourceSymbol': row['SYMBOL'], 'vector': row['VECTOR']}
    # Confidential values stay unavailable even if a source mistakenly includes a number.
    if flag in UNAVAILABLE:
        return {'value': None, 'status': UNAVAILABLE[flag], **result}
    if row['VALUE'] == '':
        return {'value': None, 'status': 'missing', **result}
    decimals = row['DECIMALS']
    if not re.fullmatch(r'\d', decimals):
        raise ValueError('Unexpected source decimal precision')
    try:
        original = Decimal(row['VALUE'])
        value = float(original * spec['multiplier'])
    except (ValueError, InvalidOperation) as error:
        raise ValueError('Invalid numeric source observation') from error
    if not math.isfinite(value) or value < 0:
        raise ValueError('Invalid numeric source observation')
    if original.as_tuple().exponent < -int(decimals):
        raise ValueError('Numeric value exceeds published source precision')
    return {'value': value, 'status': 'available', **result}


def parse_metric(raw, metric_id):
    spec = SPECS[metric_id]
    indexed = {}
    periods = set()
    for row in source_rows(raw, spec):
        if not all(row[key] == value for key, value in spec['selectors'].items()):
            continue
        if not MONTH.fullmatch(row['REF_DATE']):
            raise ValueError('Invalid monthly reference period')
        if row['GEO'] in spec['excludedGeographies']:
            continue
        region = CODES.get(row['GEO'])
        if region is None:
            raise ValueError('Unrecognized source geography')
        key = (region, row['REF_DATE'])
        if key in indexed:
            raise ValueError('Duplicate monthly observation')
        indexed[key] = observation(row, spec)
        periods.add(row['REF_DATE'])
    if not indexed:
        raise ValueError('No matching monthly energy observations')
    latest = max(periods)
    if indexed.get(('CA', latest), {}).get('status') != 'available':
        raise ValueError('Latest Canadian observation is unavailable')
    if not any(region != 'CA' and month == latest and row['status'] == 'available'
               for (region, month), row in indexed.items()):
        raise ValueError('Latest provincial coverage is unavailable')
    months = month_window(latest)
    return {
        'id': metric_id, 'label': spec['label'], 'definition': spec['definition'],
        'sourceId': f"statcan-{spec['table']}",
        **{key: spec[key] for key in ['unit', 'sourceUnit', 'sourceScale']},
        'latestMonth': latest, 'months': months,
        'observations': [{'region': region, 'month': month,
                          **indexed.get((region, month), observation(None, spec))}
                         for month in months for region in REGIONS],
    }


def parse_metadata(raw, table, latest_month):
    payload = json.loads(raw)
    if not isinstance(payload, list) or len(payload) != 1 or payload[0].get('status') != 'SUCCESS':
        raise ValueError('Unrecognized StatCan metadata response')
    meta = payload[0]['object']
    if str(meta.get('productId')) != table or meta.get('archiveStatusCode') != '2' or meta.get('frequencyCode') != 6:
        raise ValueError('Source table is no longer the selected active monthly table')
    if meta.get('cubeEndDate', '')[:7] != latest_month:
        raise ValueError('Metadata/archive end-month disagreement')
    released_at = meta.get('releaseTime', '')[:10]
    if date.fromisoformat(released_at) > datetime.now(timezone.utc).date():
        raise ValueError('Source publication date is in the future')
    if released_at[:7] < latest_month:
        raise ValueError('Source publication precedes the observed month')
    return meta, released_at


def build_snapshot(raws, metadatas, retrieved_ats, generated_at):
    sources, metrics = [], []
    for metric_id, spec in SPECS.items():
        table = spec['table']
        metric = parse_metric(raws[table], metric_id)
        meta, released_at = parse_metadata(metadatas[table], table, metric['latestMonth'])
        sources.append({
            'id': f'statcan-{table}', 'publisher': 'Statistics Canada',
            'title': meta['cubeTitleEn'],
            'url': f'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid={table}01',
            'downloadUrl': f'https://www150.statcan.gc.ca/n1/tbl/csv/{table}-eng.zip',
            'licence': 'Statistics Canada Open Licence', 'licenceUrl': LICENCE,
            'sha256': hashlib.sha256(raws[table]).hexdigest(),
            'metadataSha256': hashlib.sha256(metadatas[table]).hexdigest(),
            'releasedAt': released_at, 'retrievedAt': retrieved_ats[table],
        })
        metrics.append(metric)
    snapshot = {
        'schemaVersion': 1, 'generatedAt': generated_at,
        'regions': [{'code': code, 'name': name} for code, name in REGIONS.items()],
        'sources': sources, 'metrics': metrics,
        'attribution': 'Source: Statistics Canada. Calculations and presentation by Canada in Motion; this is not an official Statistics Canada product.',
    }
    stable = {key: value for key, value in snapshot.items() if key not in ['generatedAt', 'sources']}
    stable['sources'] = [{key: value for key, value in source.items() if key != 'retrievedAt'} for source in sources]
    snapshot['dataVersion'] = hashlib.sha256(json.dumps(stable, sort_keys=True, separators=(',', ':')).encode()).hexdigest()[:20]
    return snapshot


def fetch(url, payload=None):
    headers = {'User-Agent': 'Canada-in-Motion/1.0 public-data-refresh'}
    if payload is not None:
        headers['Content-Type'] = 'application/json'
    limit = 32 * 1024 * 1024 if payload is None else 4 * 1024 * 1024
    for attempt in range(3):
        try:
            with urlopen(Request(url, data=payload, headers=headers), timeout=90) as response:
                raw = response.read(limit + 1)
            if len(raw) > limit:
                raise ValueError('Source response exceeds size limit')
            return raw
        except HTTPError as error:
            if error.code not in {408, 429, 500, 502, 503, 504} or attempt == 2:
                raise
        except (URLError, TimeoutError):
            if attempt == 2:
                raise
        time.sleep(2 ** attempt)
    raise RuntimeError('Source fetch exhausted retries')


def atomic_write(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        stream.write(raw)
        temporary = Path(stream.name)
    temporary.replace(path)


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, default=ROOT / '.data-cache/monthly-energy')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/monthly-energy.json')
    parser.add_argument('--use-cache', action='store_true', help='Replay downloaded source archives, metadata, and original retrieval times')
    args = parser.parse_args()
    raws, metadatas, retrieved_ats = {}, {}, {}
    for spec in SPECS.values():
        table = spec['table']
        archive_path = args.cache_dir / f'{table}-eng.zip'
        metadata_path = args.cache_dir / f'{table}-metadata.json'
        receipt_path = args.cache_dir / f'{table}-retrieval.json'
        if args.use_cache:
            raw, metadata = archive_path.read_bytes(), metadata_path.read_bytes()
            receipt = json.loads(receipt_path.read_text())
            if receipt['sha256'] != hashlib.sha256(raw).hexdigest() or receipt['metadataSha256'] != hashlib.sha256(metadata).hexdigest():
                raise ValueError('Cached source does not match its retrieval receipt')
            retrieved_at = receipt['retrievedAt']
            datetime.fromisoformat(retrieved_at.replace('Z', '+00:00'))
        else:
            metadata = fetch(METADATA_URL, json.dumps([{'productId': table}]).encode())
            raw = fetch(f'https://www150.statcan.gc.ca/n1/tbl/csv/{table}-eng.zip')
            retrieved_at = now()
            # Validate before replacing the last usable cached copy.
            metric = parse_metric(raw, next(key for key, value in SPECS.items() if value['table'] == table))
            parse_metadata(metadata, table, metric['latestMonth'])
            atomic_write(archive_path, raw)
            atomic_write(metadata_path, metadata)
            atomic_write(receipt_path, json.dumps({
                'retrievedAt': retrieved_at, 'sha256': hashlib.sha256(raw).hexdigest(),
                'metadataSha256': hashlib.sha256(metadata).hexdigest()}, separators=(',', ':')).encode())
        raws[table], metadatas[table], retrieved_ats[table] = raw, metadata, retrieved_at
    snapshot = build_snapshot(raws, metadatas, retrieved_ats, now())
    atomic_write(args.output, (json.dumps(snapshot, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode())
    print(json.dumps({'file': str(args.output), 'dataVersion': snapshot['dataVersion'],
                      'latestMonths': {metric['id']: metric['latestMonth'] for metric in snapshot['metrics']},
                      'observations': sum(len(metric['observations']) for metric in snapshot['metrics'])}))


if __name__ == '__main__':
    main()
