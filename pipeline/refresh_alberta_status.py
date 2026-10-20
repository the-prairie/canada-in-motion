#!/usr/bin/env python3
"""Refresh AER's public province-wide well-licence life-cycle counts.

The Tableau worksheet is embedded by AER's Well Status page. Its CSV supplies
years, not the month of the current-year snapshot. Never invent that month or
merge these aggregate licence counts with map records from a different source.
"""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PAGE_URL = 'https://www.aer.ca/data-and-performance-reports/information-hub/well-status'
CSV_URL = 'https://www2.aer.ca/t/Production/views/WellStatus_17368672408070/WellStatusChart.csv?:showVizHome=no'
CATEGORIES = {
    'New': 'new', 'Active': 'active', 'Marginal': 'marginal', 'Inactive': 'inactive',
    'Decommissioned': 'decommissioned', 'Reclamation Certified': 'reclamationCertified',
    'Reclamation Exempt': 'reclamationExempt',
}
DEFINITIONS = {
    'active': 'A well currently in operation. The chart reports marginal wells as a separate category.',
    'marginal': 'An active well with average production below 10 barrels of oil equivalent per day.',
    'operating': 'Active plus marginal well licences. Marginal wells are active wells in AER’s definition.',
    'inactive': 'A well that has not produced oil or gas, injected fluids, or disposed of waste for 6 or 12 months, depending on type and risk.',
    'new': 'A drilled well that has not produced.',
    'decommissioned': 'A well permanently sealed and taken out of service; also called abandoned.',
    'reclamationCertified': 'A well whose site has received a reclamation certificate after return to equivalent land capacity.',
    'reclamationExempt': 'A well decommissioned before reclamation requirements came into effect (1963 in some areas, otherwise 1978).',
}


def parse_counts(raw, retrieval_year):
    reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))
    expected = ['Month (Years)', 'Well Lifecycle Status', '% of Total Well Licences', 'Well Licences']
    if reader.fieldnames != expected:
        raise ValueError('AER well-status CSV schema changed')
    grouped = {}
    for row in reader:
        if not re.fullmatch(r'20\d{2}', row['Month (Years)']):
            raise ValueError('Invalid snapshot year')
        year = int(row['Month (Years)'])
        if year > retrieval_year:
            raise ValueError('Future snapshot year')
        label = row['Well Lifecycle Status']
        if label not in CATEGORIES:
            raise ValueError('Unreviewed AER lifecycle category')
        key = CATEGORIES[label]
        bucket = grouped.setdefault(year, {})
        if key in bucket:
            raise ValueError('Duplicate year/category')
        count_text = row['Well Licences']
        if not re.fullmatch(r'(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)', count_text):
            raise ValueError('Missing or invalid licence count')
        pct_text = row['% of Total Well Licences']
        if not re.fullmatch(r'\d+(?:\.\d+)?%', pct_text):
            raise ValueError('Invalid published percentage')
        bucket[key] = (int(count_text.replace(',', '')), float(pct_text[:-1]))
    if not grouped:
        raise ValueError('No AER well-status observations')
    observations = []
    for year, values in sorted(grouped.items()):
        if set(values) != set(CATEGORIES.values()):
            raise ValueError('Incomplete lifecycle snapshot')
        counts = {key: value[0] for key, value in values.items()}
        total = sum(counts.values())
        if total <= 0:
            raise ValueError('Empty lifecycle snapshot')
        for count, percentage in values.values():
            if abs(count / total * 100 - percentage) > 0.00001:
                raise ValueError('Count/percentage mismatch')
        # Only an observed later year proves this was a past-year snapshot in
        # the publisher's extract. A stale latest row must not become Dec 31
        # simply because our refresh runs after New Year's Day.
        year_end = year < max(grouped)
        observations.append({
            'year': year, 'snapshotDate': f'{year}-12-31' if year_end else None,
            'datePrecision': 'day' if year_end else 'year',
            'periodLabel': f'{year} year-end' if year_end else f'{year} monthly snapshot (month not supplied)',
            'counts': counts, 'operating': counts['active'] + counts['marginal'], 'total': total,
        })
    return observations


def build(raw, retrieved_at):
    observations = parse_counts(raw, int(retrieved_at[:4]))
    result = {
        'schemaVersion': 1, 'region': 'AB', 'unit': 'well licences',
        'measure': 'province-wide-lifecycle-counts', 'retrievedAt': retrieved_at,
        'latestYear': observations[-1]['year'], 'latest': observations[-1],
        'observations': observations, 'definitions': DEFINITIONS,
        'source': {
            'id': 'aer-well-status', 'publisher': 'Alberta Energy Regulator',
            'title': 'Well Status — number of licensed wells in each stage of the life cycle',
            'url': PAGE_URL, 'downloadUrl': CSV_URL,
            'sha256': hashlib.sha256(raw).hexdigest(),
            'licence': 'AER attributed noncommercial reproduction',
            'licenceUrl': 'https://www.aer.ca/copyright-and-disclaimer',
        },
        'limitations': [
            'Counts cover well licences, including orphaned wells. They are not counts of mapped records or individual production strings.',
            'AER defines marginal wells as active wells. Operating is the sum of the separately displayed Active and Marginal categories.',
            'Past years are December 31 snapshots. The current-year CSV supplies only the year; its month is unknown. Retrieval date is not observation date.',
            'These provincial totals cannot be filtered by a map area, operator, text search or mapped-record status.',
        ],
        'attribution': 'Source: Alberta Energy Regulator. Calculations and presentation by Canada in Motion; not an official AER product.',
    }
    stable = {key: value for key, value in result.items() if key != 'retrievedAt'}
    result['dataVersion'] = hashlib.sha256(json.dumps(stable, sort_keys=True, separators=(',', ':')).encode()).hexdigest()[:20]
    return result


def offline_retrieved_at(raw, metadata=None, previous=None):
    """Require evidence of when these exact cached bytes were downloaded."""
    digest = hashlib.sha256(raw).hexdigest()
    candidates = [metadata or {}, {
        'sha256': (previous or {}).get('source', {}).get('sha256'),
        'retrievedAt': (previous or {}).get('retrievedAt'),
    }]
    for candidate in candidates:
        if candidate.get('sha256') != digest:
            continue
        stamp = candidate.get('retrievedAt')
        try:
            parsed = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
            if parsed.tzinfo is not None:
                return stamp
        except (AttributeError, TypeError, ValueError):
            pass
    raise ValueError('Offline cache has no verified retrieval date for these bytes; run an online refresh')


def reusable_snapshot(previous, now, max_age_hours=24):
    if max_age_hours != 24:
        return False
    try:
        retrieved = datetime.fromisoformat(previous['retrievedAt'].replace('Z', '+00:00'))
        if retrieved.tzinfo is None or not 0 <= (now - retrieved).total_seconds() <= max_age_hours * 3600:
            return False
        stable = {key: value for key, value in previous.items() if key not in ['retrievedAt', 'dataVersion']}
        digest = hashlib.sha256(json.dumps(stable, sort_keys=True, separators=(',', ':')).encode()).hexdigest()[:20]
        return digest == previous['dataVersion']
    except (AttributeError, KeyError, TypeError, ValueError):
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=ROOT / '.data-cache/alberta-status/WellStatusChart.csv')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/alberta-well-status.json')
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--max-age-hours', type=int, choices=[0, 24], default=0,
                        help='Reuse an intact snapshot within 24 hours, preserving its original retrieval date')
    args = parser.parse_args()
    if not args.offline and args.max_age_hours and args.output.exists():
        previous = json.loads(args.output.read_text())
        if reusable_snapshot(previous, datetime.now(timezone.utc), args.max_age_hours):
            print(json.dumps({'status': 'reused-verified-snapshot', 'retrievedAt': previous['retrievedAt'],
                              'dataVersion': previous['dataVersion']}))
            return
    args.cache.parent.mkdir(parents=True, exist_ok=True)
    metadata_path = args.cache.with_suffix(args.cache.suffix + '.metadata.json')
    if args.offline:
        raw = args.cache.read_bytes()
        metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else None
        previous = json.loads(args.output.read_text()) if args.output.exists() else None
        result = build(raw, offline_retrieved_at(raw, metadata, previous))
    else:
        # AER's front door rejects urllib's default TLS/user-agent combination.
        with tempfile.NamedTemporaryFile(dir=args.cache.parent) as download:
            subprocess.run(['curl', '--location', '--fail', '--silent', '--show-error', '--max-time', '60',
                            '--max-filesize', '1048576', '--user-agent', 'Canada-in-Motion/1.0 public noncommercial data refresh',
                            '--output', download.name, CSV_URL], check=True)
            raw = Path(download.name).read_bytes()
        result = build(raw, datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'))
        args.cache.write_bytes(raw)
        metadata_path.write_text(json.dumps({'sha256': result['source']['sha256'],
                                             'retrievedAt': result['retrievedAt']}) + '\n')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=args.output.parent, delete=False) as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
        temp = Path(stream.name)
    temp.replace(args.output)
    print(json.dumps({'year': result['latestYear'], 'operating': result['latest']['operating'],
                      'total': result['latest']['total'], 'dataVersion': result['dataVersion']}))


if __name__ == '__main__':
    main()
