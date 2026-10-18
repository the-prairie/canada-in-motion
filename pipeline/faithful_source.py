"""Acquire unchanged publisher responses alongside a separate application index."""
import hashlib
import html
import json
import math
import re
import urllib.parse
from datetime import datetime


def validate_responses(source, native, display, expected_ids=None):
    """Verify a complete pair of publisher responses without rewriting either."""
    oid = source['objectIdField']
    stable = source['stableIdField']
    rows = []
    for payload in (native, display):
        if payload.get('error') or payload.get('exceededTransferLimit'):
            raise ValueError('Incomplete publisher response')
        if payload.get('geometryType') != 'esriGeometryPoint':
            raise ValueError('Unexpected publisher geometry type')
        features = payload.get('features', [])
        keys = [f['attributes'][oid] for f in features]
        stable_ids = [f['attributes'].get(stable) for f in features]
        if not keys or len(set(keys)) != len(keys) or (expected_ids is not None and set(keys) != set(expected_ids)):
            raise ValueError('Incomplete publisher ID enumeration')
        if any(x is None or not str(x).strip() for x in stable_ids) or len(set(stable_ids)) != len(stable_ids):
            raise ValueError('Missing or duplicate publisher stable ID')
        for feature in features:
            if not all(isinstance(feature.get('geometry', {}).get(k), (float, int)) and math.isfinite(feature['geometry'][k]) for k in ('x', 'y')):
                raise ValueError('Invalid publisher point coordinates')
        rows.append({f['attributes'][oid]: f['attributes'] for f in features})
    if rows[0] != rows[1]:
        raise ValueError('Publisher attributes differ between projections')
    if display.get('spatialReference', {}).get('wkid') != 4326:
        raise ValueError('Publisher display geometry is not WGS84')
    west, south, east, north = source.get('coordinateBounds', [-142, 40, -50, 84])
    if any(not (west <= f['geometry']['x'] <= east and south <= f['geometry']['y'] <= north) for f in display['features']):
        raise ValueError('Publisher geometry outside declared source envelope')
    return display['features']


def acquire(source, request):
    originals = {}

    def fetch(name, url):
        content, _ = request(url)
        value = json.loads(content)
        if value.get('error'):
            raise ValueError('Publisher request failed')
        originals[name] = (url, content)
        return value

    item_url = 'https://www.arcgis.com/sharing/rest/content/items/' + source['itemId'] + '?f=json'
    item = fetch('publisher-item.json', item_url)
    if item.get('owner') != source['itemOwner'] or item.get('url') != source['serviceUrl']:
        raise ValueError('Publisher item identity changed')
    if hashlib.sha256(item.get('licenseInfo', '').encode()).hexdigest() != source['itemLicenceSha256']:
        raise ValueError('Publisher item terms changed')
    policy_bytes, _ = request(source['licenceUrl'])
    policy = ' '.join(html.unescape(re.sub('<[^>]+>', ' ', policy_bytes.decode())).split())
    if not all(x in policy for x in ['without further permission', 'must not be modified', 'non-commercial purposes']):
        raise ValueError('Noncommercial reproduction policy changed')
    service = fetch('publisher-service.json', source['serviceUrl'] + '?f=json')
    candidates = [x for x in service.get('layers', []) if x.get('geometryType') == 'esriGeometryPoint' and x['name'].startswith(source['layerNamePrefix'])]
    if len(candidates) != 1 or service.get('serviceItemId') != source['itemId']:
        raise ValueError('Cannot identify publisher well layer')
    source['url'] = source['serviceUrl'] + '/' + str(candidates[0]['id'])
    meta = fetch('publisher-layer.json', source['url'] + '?f=json')
    names = {x['name'] for x in meta.get('fields', []) if x.get('type') != 'esriFieldTypeGeometry'}
    if not set(source['requiredFields']) <= names or set(source['rawFields']) != names:
        raise ValueError('Publisher well schema changed; every original attribute must be retained')

    def query(name, **params):
        return fetch(name, source['url'] + '/query?' + urllib.parse.urlencode({'f': 'json', **params}))

    ids = sorted(query('publisher-ids.json', where='1=1', returnIdsOnly='true')['objectIds'])
    count = query('publisher-count.json', where='1=1', returnCountOnly='true')['count']
    if not ids or len(set(ids)) != len(ids) or len(ids) != count:
        raise ValueError('Publisher count and ID enumeration disagree')
    native = query('publisher-native.json', where='1=1', outFields='*', returnGeometry='true', orderByFields=source['objectIdField'])
    display = query('publisher-wgs84.json', where='1=1', outFields='*', returnGeometry='true', orderByFields=source['objectIdField'], outSR=4326)
    features = validate_responses(source, native, display, ids)
    final = query('publisher-final-ids.json', where='1=1', returnIdsOnly='true')
    if sorted(final['objectIds']) != ids:
        raise ValueError('Source changed during acquisition')
    description = ' '.join(re.sub('<[^>]+>', '', meta.get('description', '')).split())
    match = re.search(r'last updated ([A-Za-z]+) (\d+)(?:st|nd|rd|th)?, (\d{4})', description, re.I)
    if not match:
        raise ValueError('Publisher observation date is missing')
    observation = datetime.strptime(' '.join(match.groups()), '%B %d %Y').date().isoformat()
    evidence = {'sourceCount': len(ids), 'enumerationVerified': True, 'upstreamModifiedAt': meta.get('editingInfo', {}).get('lastEditDate'), 'sourceDateText': observation, 'sourceObservationDate': observation, 'sourceDescription': description, 'reproductionPolicySha256': hashlib.sha256(policy_bytes).hexdigest()}
    return features, evidence, originals
