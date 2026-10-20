"""Official source acquisition for provincial real-GDP forecasting.

The GDP target is a single consistent basic-price series. These are latest
vintages, not reconstructed historical vintages. Monthly LFS values are already
in thousands of people: the CSV scalar must not be applied a second time.
"""
import csv
from datetime import date
import hashlib
import io
import json
import math
from pathlib import Path
import re
import tempfile
from urllib.request import Request, urlopen
from zipfile import ZipFile

REGIONS = {
    'Canada': 'CA', 'Newfoundland and Labrador': 'NL', 'Prince Edward Island': 'PE',
    'Nova Scotia': 'NS', 'New Brunswick': 'NB', 'Quebec': 'QC', 'Ontario': 'ON',
    'Manitoba': 'MB', 'Saskatchewan': 'SK', 'Alberta': 'AB', 'British Columbia': 'BC',
    'Yukon': 'YT', 'Northwest Territories': 'NT', 'Nunavut': 'NU',
}
PROVINCES = ('NL', 'PE', 'NS', 'NB', 'QC', 'ON', 'MB', 'SK', 'AB', 'BC')
SOURCES = (
    {
        'id': 'statcan-provincial-basic-gdp', 'productId': '36100711',
        'title': 'Real GDP at basic prices, all industries, provinces and territories',
        'url': 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610071101',
        'downloadUrl': 'https://www150.statcan.gc.ca/n1/tbl/csv/36100711-eng.zip',
        'unit': 'million chained 2017 Canadian dollars',
        'locator': 'All industries [T001]; Chained (2017) dollars',
    },
    {
        'id': 'statcan-provincial-monthly-labour', 'productId': '14100287',
        'title': 'Monthly Labour Force Survey, seasonally adjusted',
        'url': 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410028701',
        'downloadUrl': 'https://www150.statcan.gc.ca/n1/tbl/csv/14100287-eng.zip',
        'unit': 'employment: thousand persons; unemployment rate: percent',
        'locator': 'Employment and unemployment rate; Total - Gender; 15 years and over; Estimate; Seasonally adjusted',
    },
)
MISSING = {'..', '...', 'x', 'F'}
ACCEPTED = {'', 'p', 'r', 'A', 'B', 'C', 'D', 'E', '0s'} | MISSING


def _rows(raw, product_id):
    with ZipFile(io.BytesIO(raw)) as archive:
        with archive.open(product_id + '.csv') as stream:
            yield from csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig'))


def _value(row, allow_zero=False, upper=None):
    status = row['STATUS']
    if status not in ACCEPTED:
        raise ValueError(f'Unknown source status: {status}')
    if status in MISSING or not row['VALUE']:
        return None, 'not-published'
    value = float(row['VALUE'])
    if not math.isfinite(value) or value < 0 or (value == 0 and not allow_zero) or (upper is not None and value > upper):
        raise ValueError('Invalid source value')
    return value, 'available'


def parse_gdp(raw):
    result, seen = [], set()
    for row in _rows(raw, '36100711'):
        if row['Prices'] != 'Chained (2017) dollars' or row['North American Industry Classification System (NAICS)'] != 'All industries [T001]':
            continue
        if row['GEO'] not in REGIONS or row['GEO'] == 'Canada':
            raise ValueError('GDP geography changed')
        if row['UOM'] != 'Dollars' or row['SCALAR_FACTOR'] != 'millions' or not re.fullmatch(r'\d{4}', row['REF_DATE']):
            raise ValueError('GDP unit or period changed')
        key = (REGIONS[row['GEO']], int(row['REF_DATE']))
        if key in seen:
            raise ValueError('Duplicate provincial GDP record')
        seen.add(key)
        value, status = _value(row)
        result.append({'region': key[0], 'year': key[1], 'value': value, 'status': status,
                       'vector': row['VECTOR'], 'sourceStatus': row['STATUS'],
                       'sourceId': 'statcan-provincial-basic-gdp'})
    return sorted(result, key=lambda item: (item['region'], item['year']))


def parse_labour(raw):
    result = {'employment': [], 'unemployment': []}
    seen = set()
    for row in _rows(raw, '14100287'):
        measure = {'Employment': 'employment', 'Unemployment rate': 'unemployment'}.get(row['Labour force characteristics'])
        if not measure or row['Gender'] != 'Total - Gender' or row['Age group'] != '15 years and over' or row['Statistics'] != 'Estimate' or row['Data type'] != 'Seasonally adjusted':
            continue
        if row['GEO'] not in REGIONS:
            raise ValueError('LFS geography changed')
        unit, scalar = ('Persons in thousands', 'thousands') if measure == 'employment' else ('Percent', 'units')
        if row['UOM'] != unit or row['SCALAR_FACTOR'] != scalar or not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', row['REF_DATE']):
            raise ValueError('LFS unit or month changed')
        key = (measure, REGIONS[row['GEO']], row['REF_DATE'])
        if key in seen:
            raise ValueError('Duplicate monthly LFS record')
        seen.add(key)
        value, status = _value(row, allow_zero=measure == 'unemployment', upper=100 if measure == 'unemployment' else None)
        result[measure].append({'region': key[1], 'month': key[2], 'value': value, 'status': status,
                                'vector': row['VECTOR'], 'sourceStatus': row['STATUS'],
                                'sourceId': 'statcan-provincial-monthly-labour'})
    for rows in result.values():
        rows.sort(key=lambda item: (item['region'], item['month']))
    return result


def _atomic_write(path, raw):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(raw)
    temporary.replace(path)


def _fetch(url, data=None):
    headers = {'User-Agent': 'Canada-in-Motion public research data pipeline/1.0'}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    with urlopen(Request(url, data=data, headers=headers), timeout=240) as response:
        return response.read()


def load_sources(cache_dir, offline=False, as_of=None):
    """Return validated latest-vintage GDP, employment and unemployment records.

    as_of controls current release eligibility, not historical vintage recovery.
    Online runs refresh both archives; offline runs require pinned local files.
    """
    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    as_of = date.fromisoformat(as_of) if isinstance(as_of, str) else (as_of or date.today())
    sources, datasets = [], {}
    for source in SOURCES:
        code = source['productId']
        archive_path = cache / (code + '-eng.zip')
        metadata_path = cache / (code + '-metadata.json')
        if offline:
            raw, meta_raw = archive_path.read_bytes(), metadata_path.read_bytes()
        else:
            meta_raw = _fetch('https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata',
                              json.dumps([{'productId': code}]).encode())
            raw = _fetch(source['downloadUrl'])
        payload = json.loads(meta_raw)
        if not isinstance(payload, list) or len(payload) != 1 or payload[0].get('status') != 'SUCCESS':
            raise ValueError('Unrecognized StatCan metadata response')
        metadata = payload[0]['object']
        release = metadata['releaseTime']
        if date.fromisoformat(release[:10]) > as_of:
            raise ValueError('Source release is after forecast as-of date')
        parsed = parse_gdp(raw) if code == '36100711' else parse_labour(raw)
        if code == '36100711':
            if len(parsed) < 375 or {row['region'] for row in parsed} != set(REGIONS.values()) - {'CA'}:
                raise ValueError('GDP coverage regressed')
            datasets['gdp'] = parsed
            last = max(row['year'] for row in parsed)
            if str(last) != metadata['cubeEndDate'][:4]:
                raise ValueError('GDP metadata/archive periods disagree')
        else:
            for measure, records in parsed.items():
                if len(records) < 6000 or not set(PROVINCES).issubset({row['region'] for row in records}):
                    raise ValueError('LFS coverage regressed')
                if max(row['month'] for row in records) != metadata['cubeEndDate'][:7]:
                    raise ValueError('LFS metadata/archive periods disagree')
                datasets[measure] = records
        if not offline:
            _atomic_write(archive_path, raw)
            _atomic_write(metadata_path, meta_raw)
        sources.append({**source, 'publisher': 'Statistics Canada',
                        'license': 'Statistics Canada Open Licence',
                        'licenseUrl': 'https://www.statcan.gc.ca/en/reference/licence',
                        'sha256': hashlib.sha256(raw).hexdigest(),
                        'metadataSha256': hashlib.sha256(meta_raw).hexdigest(),
                        'releaseTime': release, 'firstPeriod': metadata['cubeStartDate'],
                        'lastPeriod': metadata['cubeEndDate'],
                        'vintage': 'latest-published; not historical release vintages',
                        'retrievedDate': as_of.isoformat()})
    return {'asOf': as_of.isoformat(), 'sources': sources, **datasets}
