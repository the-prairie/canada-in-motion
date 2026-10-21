"""Load source-qualified monthly predictors without joining predecessor tables.

Returned sales values use published thousand current CAD. CPI is an index and
remains a separate predictor; no synthetic real-sales series is constructed.
"""
import argparse
import csv
from datetime import date, datetime, timezone
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
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
PROVINCES = {
    'Newfoundland and Labrador': 'NL', 'Prince Edward Island': 'PE',
    'Nova Scotia': 'NS', 'New Brunswick': 'NB', 'Quebec': 'QC', 'Ontario': 'ON',
    'Manitoba': 'MB', 'Saskatchewan': 'SK', 'Alberta': 'AB', 'British Columbia': 'BC',
}
SPECS = {
    'retail': {
        'productId': '20100056', 'label': 'Retail sales',
        'selectors': {'North American Industry Classification System (NAICS)': 'Retail trade [44-45]',
                      'Sales': 'Total retail sales', 'Adjustments': 'Seasonally adjusted'},
        'unit': 'thousand current CAD', 'sourceUnit': 'Dollars', 'sourceScale': 'thousands',
        'adjustment': 'seasonally-adjusted', 'minimumMonths': 100,
    },
    'manufacturing': {
        'productId': '16100048', 'label': 'Manufacturing sales',
        'selectors': {'North American Industry Classification System (NAICS)': 'Manufacturing [31-33]',
                      'Principal statistics': 'Sales of goods manufactured (shipments)',
                      'Seasonal adjustment': 'Seasonally adjusted'},
        'unit': 'thousand current CAD', 'sourceUnit': 'Dollars', 'sourceScale': 'thousands',
        'adjustment': 'seasonally-adjusted', 'minimumMonths': 400,
    },
    'cpi': {
        'productId': '18100004', 'label': 'Consumer Price Index, all items',
        'selectors': {'Products and product groups': 'All-items'},
        'unit': 'index, 2002=100', 'sourceUnit': '2002=100', 'sourceScale': 'units',
        'adjustment': 'not-seasonally-adjusted', 'minimumMonths': 500,
    },
}
BASE_COLUMNS = {'REF_DATE', 'GEO', 'DGUID', 'UOM', 'UOM_ID', 'SCALAR_FACTOR', 'SCALAR_ID',
                'VECTOR', 'COORDINATE', 'VALUE', 'STATUS', 'SYMBOL', 'TERMINATED', 'DECIMALS'}
UNAVAILABLE = {'x': 'suppressed', '..': 'missing', '...': 'not-applicable', 'F': 'unreliable'}
AVAILABLE = {'', 'p', 'r', 'A', 'B', 'C', 'D', 'E', '0s'}
METADATA_URL = 'https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata'
MONTH = re.compile(r'^\d{4}-(0[1-9]|1[0-2])$')


def parse_series(raw, metric):
    spec = SPECS[metric]
    result, seen = [], set()
    with ZipFile(io.BytesIO(raw)) as archive:
        target = spec['productId'] + '.csv'
        if archive.namelist().count(target) != 1 or archive.getinfo(target).file_size > 1024 ** 3:
            raise ValueError('Unexpected source CSV archive')
        with archive.open(target) as stream:
            reader = csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig'))
            expected = BASE_COLUMNS | set(spec['selectors'])
            if reader.fieldnames is None or len(reader.fieldnames) != len(expected) or set(reader.fieldnames) != expected:
                raise ValueError('Source dimensions or columns changed')
            for row in reader:
                if None in row or any(value is None for value in row.values()):
                    raise ValueError('Malformed source CSV row')
                if row['GEO'] not in PROVINCES or not all(row[k] == v for k, v in spec['selectors'].items()):
                    continue
                if (row['UOM'], row['SCALAR_FACTOR']) != (spec['sourceUnit'], spec['sourceScale']):
                    raise ValueError('Source unit or scale changed')
                if not MONTH.fullmatch(row['REF_DATE']) or not re.fullmatch(r'v\d+', row['VECTOR']):
                    raise ValueError('Invalid source period or vector')
                if row['TERMINATED']:
                    raise ValueError('Selected source series terminated')
                key = PROVINCES[row['GEO']], row['REF_DATE']
                if key in seen:
                    raise ValueError('Duplicate province-month observation')
                seen.add(key)
                flags = row['STATUS'], row['SYMBOL']
                if any(flag not in AVAILABLE and flag not in UNAVAILABLE for flag in flags):
                    raise ValueError('Unknown source status or symbol')
                withheld = [UNAVAILABLE[flag] for flag in flags if flag in UNAVAILABLE]
                value, status = None, withheld[0] if withheld else 'missing'
                if not withheld and row['VALUE'] != '':
                    value = float(row['VALUE'])
                    if not math.isfinite(value) or value < 0 or (metric == 'cpi' and value == 0):
                        raise ValueError('Invalid numeric source observation')
                    status = 'available'
                result.append({'region': key[0], 'month': key[1], 'value': value, 'status': status,
                               'vector': row['VECTOR'], 'sourceStatus': row['STATUS'], 'sourceSymbol': row['SYMBOL'],
                               'sourceId': 'statcan-' + spec['productId']})
    if not result:
        raise ValueError('No selected provincial source observations')
    return sorted(result, key=lambda row: (row['region'], row['month']))


def parse_metadata(raw, metric, rows, as_of):
    spec = SPECS[metric]
    payload = json.loads(raw)
    if not isinstance(payload, list) or len(payload) != 1 or payload[0].get('status') != 'SUCCESS':
        raise ValueError('Unrecognized StatCan metadata response')
    meta = payload[0]['object']
    if str(meta.get('productId')) != spec['productId'] or meta.get('archiveStatusCode') != '2' or meta.get('frequencyCode') != 6:
        raise ValueError('Source is not the selected active monthly table')
    released = date.fromisoformat(meta['releaseTime'][:10])
    if released > as_of or meta['cubeEndDate'][:10] > as_of.isoformat():
        raise ValueError('Source release or observation is after the as-of date')
    latest = meta['cubeEndDate'][:7]
    if max(r['month'] for r in rows) != latest:
        raise ValueError('Source metadata/archive end-month disagreement')
    coverage = {}
    for region in PROVINCES.values():
        selected = [r for r in rows if r['region'] == region]
        if len(selected) < spec['minimumMonths'] or selected[-1]['month'] != latest:
            raise ValueError('Provincial source coverage regressed')
        coverage[region] = {'firstMonth': selected[0]['month'], 'lastMonth': selected[-1]['month'],
                            'count': len(selected), 'availableCount': sum(r['status'] == 'available' for r in selected),
                            'latestStatus': selected[-1]['status']}
    return meta, coverage


def fetch(url, payload=None):
    headers = {'User-Agent': 'Canada-in-Motion/1.0 public-data-refresh'}
    if payload is not None:
        headers['Content-Type'] = 'application/json'
    limit = 128 * 1024 ** 2 if payload is None else 4 * 1024 ** 2
    for attempt in range(3):
        try:
            with urlopen(Request(url, data=payload, headers=headers), timeout=240) as response:
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
    raise RuntimeError('Source retrieval exhausted retries')


def atomic_write(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        stream.write(raw)
        temporary = Path(stream.name)
    temporary.replace(path)


def load_broad_sources(cache_dir, offline=False, as_of=None):
    """Return full monthly histories plus verified table and retrieval provenance."""
    as_of = date.fromisoformat(as_of) if isinstance(as_of, str) else (as_of or date.today())
    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    sources, series = [], {}
    for metric, spec in SPECS.items():
        table = spec['productId']
        archive_path, metadata_path, receipt_path = [cache / (table + suffix) for suffix in ['-eng.zip', '-metadata.json', '-retrieval.json']]
        if offline:
            raw, metadata = archive_path.read_bytes(), metadata_path.read_bytes()
            receipt = json.loads(receipt_path.read_text())
        else:
            metadata = fetch(METADATA_URL, json.dumps([{'productId': table}]).encode())
            raw = fetch(f'https://www150.statcan.gc.ca/n1/tbl/csv/{table}-eng.zip')
            receipt = {'retrievedAt': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
                       'sha256': hashlib.sha256(raw).hexdigest(), 'metadataSha256': hashlib.sha256(metadata).hexdigest()}
        if receipt['sha256'] != hashlib.sha256(raw).hexdigest() or receipt['metadataSha256'] != hashlib.sha256(metadata).hexdigest():
            raise ValueError('Cached source differs from its retrieval receipt')
        retrieved = datetime.fromisoformat(receipt['retrievedAt'].replace('Z', '+00:00')).date()
        if not 0 <= (as_of - retrieved).days <= 8:
            raise ValueError('Source retrieval is stale or after the as-of date')
        rows = parse_series(raw, metric)
        meta, coverage = parse_metadata(metadata, metric, rows, as_of)
        if not offline:
            atomic_write(archive_path, raw)
            atomic_write(metadata_path, metadata)
            atomic_write(receipt_path, json.dumps(receipt, separators=(',', ':')).encode())
        sources.append({'id': 'statcan-' + table, 'metric': metric, 'productId': table,
                        'title': meta['cubeTitleEn'], 'publisher': 'Statistics Canada',
                        'url': f'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid={table}01',
                        'downloadUrl': f'https://www150.statcan.gc.ca/n1/tbl/csv/{table}-eng.zip',
                        'selectors': spec['selectors'], 'unit': spec['unit'], 'sourceUnit': spec['sourceUnit'],
                        'sourceScale': spec['sourceScale'], 'adjustment': spec['adjustment'],
                        'firstPeriod': min(r['month'] for r in rows), 'lastPeriod': max(r['month'] for r in rows),
                        'releaseTime': meta['releaseTime'], 'coverage': coverage, **receipt,
                        'licence': 'Statistics Canada Open Licence',
                        'licenceUrl': 'https://www.statcan.gc.ca/en/reference/licence',
                        'vintage': 'Latest revised history, not historical release vintages.'})
        series[metric] = rows
    return {'schemaVersion': 1, 'asOf': as_of.isoformat(), 'sources': sources, 'series': series}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, default=ROOT / '.data-cache/broad-gdp-research')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--as-of', default=date.today().isoformat())
    args = parser.parse_args()
    data = load_broad_sources(args.cache, args.offline, args.as_of)
    if args.output:
        atomic_write(args.output, (json.dumps(data, separators=(',', ':')) + '\n').encode())
    print(json.dumps({'sources': [{s['metric']: [s['firstPeriod'], s['lastPeriod']]} for s in data['sources']],
                      'observations': {key: len(rows) for key, rows in data['series'].items()}}))


if __name__ == '__main__':
    main()
