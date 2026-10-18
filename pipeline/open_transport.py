"""Fetch openly licensed historical geometry and dated CER benchmark references."""
import argparse
import concurrent.futures
import csv
import datetime as dt
import hashlib
import io
import json
import math
from pathlib import Path
import re
import urllib.request
import zipfile

import shapefile
from pyproj import CRS, Transformer

CATALOGS = {
    'tolls': 'e00172b8-35c2-4651-a8c5-13ab30bd7236',
    'attributes': '16282d1a-383f-4b9e-b703-a3ee21e59dc5',
    'canvec': '92dbea79-f644-4a62-b25e-8eb993ca0264',
}
ZIP_URL = 'https://ftp.maps.canada.ca/pub/nrcan_rncan/vector/canvec/shp/Res_MGT/canvec_250K_CA_Res_MGT_shp.zip'
LICENCE = {'name': 'Open Government Licence - Canada', 'url': 'https://open.canada.ca/en/open-government-licence-canada', 'attribution': 'Contains information licensed under the Open Government Licence - Canada.'}
TOLL_FIELDS = ['Date', 'Corporate Entity', 'Pipeline Name', 'Path', 'Service', 'Product', 'Toll', 'Unit', 'Tariff Number', 'Replaces Tariff Number', 'REGDOCS Folder', 'REGDOCS Download Link']

def fetch(url, path, reuse):
    if reuse and path.exists():
        if dt.datetime.now(dt.timezone.utc).timestamp()-path.stat().st_mtime > 4*3600: raise ValueError('Research cache is older than four hours')
        body = path.read_bytes()
        meta = {'retrievedAt': dt.datetime.fromtimestamp(path.stat().st_mtime, dt.timezone.utc).isoformat(), 'upstreamModifiedAt': None, 'researchCache': True}
    else:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'CanadaInMotion-OpenData/2.1'}), timeout=90) as response:
            body = response.read(200_000_001)
            if len(body) > 200_000_000:
                raise ValueError('Source exceeds 200 MB acquisition limit')
            meta = {'retrievedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'upstreamModifiedAt': response.headers.get('Last-Modified')}
        path.write_bytes(body)
    return body, {**meta, 'url': url, 'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body)}

def text(body):
    try:
        return body.decode('utf-8-sig')
    except UnicodeDecodeError:
        return body.decode('cp1252')

def csv_rows(body):
    reader = csv.DictReader(io.StringIO(text(body)))
    rows = list(reader)
    if not rows or None in reader.fieldnames or any(None in row for row in rows):
        raise ValueError('Empty or malformed source CSV')
    return reader.fieldnames, rows

def toll_snapshot(resource, cache, reuse, as_of):
    body, evidence = fetch(resource['url'], cache / resource['url'].rsplit('/', 1)[-1], reuse)
    reader = csv.DictReader(io.StringIO(text(body)))
    if reader.fieldnames != TOLL_FIELDS:
        raise ValueError('Unexpected toll schema: ' + resource['name'])
    latest = ''
    selected = []
    total = 0
    future = 0
    undated = 0
    for row in reader:
        total += 1
        if None in row or any(value is None for value in row.values()):
            raise ValueError('Malformed benchmark CSV row')
        if not row['Date']:
            undated += 1
            continue
        dt.date.fromisoformat(row['Date'])
        if row['Date'] > as_of:
            future += 1
            continue
        if row['Date'] > latest:
            latest = row['Date']
            selected = []
        if row['Date'] == latest:
            selected.append(row)
    if not selected:
        raise ValueError('No benchmark observation on or before snapshot date')
    for row in selected:
        if not row['Unit'].strip() or not row['Toll'].strip() or not row['Pipeline Name'].strip():
            raise ValueError('Missing benchmark identity or unit')
    return {'name': resource['name'], 'latestObservationDate': latest, 'currentValidity': 'not-verified', 'eligibleForQuote': False, 'historyRowCount': total, 'excludedFutureRows': future, 'excludedUndatedRows': undated, 'snapshotRowCount': len(selected), 'source': evidence, 'rows': selected}

def historical_geometry(body):
    result = []
    counts = {}
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        for layer, kind in [('pipeline_1', 'pipeline'), ('petroleum_refinery_0', 'refinery')]:
            name = 'canvec_250K_CA_Res_MGT/' + layer
            reader = shapefile.Reader(shp=io.BytesIO(archive.read(name + '.shp')), shx=io.BytesIO(archive.read(name + '.shx')), dbf=io.BytesIO(archive.read(name + '.dbf')), encoding='utf-8')
            transform = Transformer.from_crs(CRS.from_wkt(archive.read(name + '.prj').decode()), CRS.from_epsg(4326), always_xy=True)
            counts[kind] = len(reader)
            for item in reader.iterShapeRecords():
                raw = item.record.as_dict()
                def position(point):
                    x, y = transform.transform(point[0], point[1])
                    if not all(math.isfinite(v) for v in [x, y]) or not -180 <= x <= 180 or not -90 <= y <= 90:
                        raise ValueError('Invalid geometry coordinate')
                    return [round(x, 6), round(y, 6)]
                if kind == 'refinery':
                    geometry = {'type': 'Point', 'coordinates': position(item.shape.points[0])}
                else:
                    ends = list(item.shape.parts) + [len(item.shape.points)]
                    parts = [[position(p) for p in item.shape.points[ends[i]:ends[i+1]]] for i in range(len(ends)-1)]
                    if any(len(part) < 2 for part in parts):
                        raise ValueError('Invalid pipeline line')
                    geometry = {'type': 'MultiLineString', 'coordinates': parts}
                result.append({'type': 'Feature', 'id': 'canvec-' + raw['feature_id'], 'geometry': geometry, 'properties': {'kind': kind, 'sourceId': raw['feature_id'], 'sourceDateMin': raw['datemin'], 'sourceDateMax': raw['datemax'], 'historical': True, 'name': raw.get('facname') or 'Mapped pipeline segment', 'product': raw.get('pippdt_en'), 'position': raw.get('piprgrd_en'), 'facilityType': raw.get('petrodscen'), 'operatingStatus': 'Not established by this historical layer'}})
    if len({feature['id'] for feature in result}) != len(result):
        raise ValueError('Duplicate CanVec feature ID')
    return {'type': 'FeatureCollection', 'features': result}, counts

def run(output, cache, reuse=False, as_of=None):
    as_of = as_of or dt.datetime.now(dt.timezone.utc).date().isoformat()
    dt.date.fromisoformat(as_of)
    output.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    catalogs = {}
    for name, identifier in CATALOGS.items():
        body, evidence = fetch('https://open.canada.ca/data/api/action/package_show?id=' + identifier, cache / (name + '-catalog.json'), reuse)
        catalog = json.loads(body)['result']
        if catalog.get('license_title') != LICENCE['name']:
            raise ValueError('Source licence changed: ' + name)
        catalogs[name] = {'record': catalog, 'evidence': evidence}
    body, geometry_source = fetch(ZIP_URL, cache / 'canvec_250K.zip', reuse)
    geometry, counts = historical_geometry(body)
    geometry['metadata'] = {'title': 'Historical CanVec pipelines and refineries', 'scale': '1:250,000', 'source': geometry_source, 'catalogue': catalogs['canvec']['evidence'], 'licence': LICENCE, 'counts': counts, 'scope': 'Historical cartographic records. Source dates vary by feature. Not a current operating inventory, navigation aid, or price route geometry.'}
    resources = [resource for resource in catalogs['tolls']['record']['resources'] if resource.get('language') == ['en'] and resource.get('resource_type') == 'dataset']
    if not resources:
        raise ValueError('No English toll dataset resources')
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        snapshots = list(pool.map(lambda resource: toll_snapshot(resource, cache, reuse, as_of), resources))
    tolls = {'schemaVersion': 1, 'title': 'CER benchmark toll observations', 'snapshotAsOf': as_of, 'currentValidity': 'not-verified', 'eligibleForQuote': False, 'licence': LICENCE, 'catalogue': catalogs['tolls']['evidence'], 'scope': 'Latest observed date on or before the snapshot date in each CER CSV. These are dated benchmark observations, not a current quote, full tariff, or total shipping cost. Preserve units and service conditions. Never aggregate across incompatible units.', 'systemCount': len(snapshots), 'rowCount': sum(item['snapshotRowCount'] for item in snapshots), 'systems': snapshots}
    attributes_resource = next(resource for resource in catalogs['attributes']['record']['resources'] if resource.get('language') == ['en'] and resource.get('resource_type') == 'dataset')
    body, attributes_source = fetch(attributes_resource['url'], cache / 'pipeline-attributes.csv', reuse)
    fields, rows = csv_rows(body)
    if 'Pipeline name' not in fields or 'CER Pipeline Profile' not in fields:
        raise ValueError('Unexpected pipeline attributes schema')
    attributes = {'schemaVersion': 1, 'title': 'CER major pipeline attributes', 'source': attributes_source, 'catalogue': catalogs['attributes']['evidence'], 'licence': LICENCE, 'scope': 'Major federally regulated systems. This table is not a complete provincial infrastructure inventory. URLs to external maps do not license their geometry.', 'rowCount': len(rows), 'rows': rows}
    for name, data in [('historical-infrastructure.geojson', geometry), ('benchmark-tolls.json', tolls), ('pipeline-attributes.json', attributes)]:
        temporary = output / (name + '.tmp')
        temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
        temporary.replace(output / name)
    return {'geometry': counts, 'benchmarkSystems': tolls['systemCount'], 'benchmarkRows': tolls['rowCount'], 'pipelineAttributes': len(rows)}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--research-cache', action='store_true')
    parser.add_argument('--as-of', help='ISO date; defaults to the current UTC date')
    args = parser.parse_args()
    print(json.dumps(run(args.output, args.cache, args.research_cache, args.as_of)))
