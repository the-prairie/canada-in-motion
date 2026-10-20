#!/usr/bin/env python3
"""Publish oil/GDP history and reproducible, latest-vintage local-projection checks.

No causal price-to-GDP scenario is enabled by this experiment. Annual OLS uses
published structural shocks as candidate regressors; it does not re-identify
those shocks or convert an arbitrary WTI move into a structural intervention.
All parsing, estimation and backtesting use Python's standard library.
"""
import argparse
import csv
from datetime import datetime, timezone, timedelta
import hashlib
from html import unescape
import io
import json
import math
from pathlib import Path
import re
import statistics
import tempfile
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
REGIONS = {'Canada': 'CA', 'Newfoundland and Labrador': 'NL', 'Prince Edward Island': 'PE',
           'Nova Scotia': 'NS', 'New Brunswick': 'NB', 'Quebec': 'QC', 'Ontario': 'ON',
           'Manitoba': 'MB', 'Saskatchewan': 'SK', 'Alberta': 'AB', 'British Columbia': 'BC',
           'Yukon': 'YT', 'Northwest Territories': 'NT', 'Nunavut': 'NU'}
SOURCES = [
    {'id': 'statcan-real-provincial-gdp-history', 'title': 'Provincial and territorial real GDP at market prices',
     'publisher': 'Statistics Canada', 'url': 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610022201',
     'downloadUrl': 'https://www150.statcan.gc.ca/n1/tbl/csv/36100222-eng.zip', 'filename': 'gdp-expenditure.zip',
     'locator': 'Table 36-10-0222-01; Gross domestic product at market prices; Chained (2017) dollars; millions',
     'license': 'Statistics Canada Open Licence', 'licenseUrl': 'https://www.statcan.gc.ca/en/reference/licence'},
    {'id': 'eia-annual-wti-history', 'title': 'Cushing, Oklahoma WTI spot price FOB: annual average',
     'publisher': 'US Energy Information Administration',
     'url': 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=RWTC&f=A',
     'downloadUrl': 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=RWTC&f=A', 'filename': 'wti.html',
     'locator': 'RWTC annual; dollars per barrel; full calendar years only',
     'license': 'US government public data', 'licenseUrl': 'https://www.eia.gov/about/copyrights_reuse.php'},
    {'id': 'bh-2019-oil-supply-shocks', 'title': 'Structural oil supply shocks, updated author estimates',
     'publisher': 'Christiane Baumeister and James D. Hamilton', 'url': 'https://sites.google.com/site/cjsbaumeister/research',
     'downloadUrl': 'https://drive.google.com/uc?export=download&id=1OsA8btgm2rmDucUFngiLkwv4uywTDmya', 'filename': 'supply',
     'locator': 'Monthly posterior median structural supply shock estimates, February 1975 onward',
     'citation': 'Baumeister and Hamilton (2019), American Economic Review 109(5), 1873–1910, doi:10.1257/aer.20151569'},
    {'id': 'bh-2019-oil-demand-shocks', 'title': 'Structural oil demand shocks, updated author estimates',
     'publisher': 'Christiane Baumeister and James D. Hamilton', 'url': 'https://sites.google.com/site/cjsbaumeister/research',
     'downloadUrl': 'https://drive.google.com/uc?export=download&id=1neFXLrIvGwggebQRwjmtrWK-dfQZ9NH8', 'filename': 'demand',
     'locator': 'Monthly posterior median economic activity, oil consumption demand and inventory demand shocks',
     'citation': 'Baumeister and Hamilton (2019), American Economic Review 109(5), 1873–1910, doi:10.1257/aer.20151569'},
    {'id': 'kaenzig-2021-oil-supply-news', 'title': 'Oil supply news shocks: December 2025 vintage',
     'publisher': 'Diego R. Känzig', 'license': 'Creative Commons Attribution 4.0 International', 'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/', 'url': 'https://github.com/dkaenzig/oilsupplynews',
     'downloadUrl': 'https://raw.githubusercontent.com/dkaenzig/oilsupplynews/master/oilSupplyNewsShocks_2025M12.xlsx',
     'filename': 'kaenzig.xlsx', 'locator': 'Monthly worksheet, Oil supply news shock column; annual sum of twelve months',
     'citation': 'Känzig (2021), American Economic Review 111(4), 1092–1125, doi:10.1257/aer.20190964'},
]
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'


def read_xlsx(raw, sheet_name=None):
    """Read values without executing formulas; fail on unsupported date layouts."""
    with ZipFile(io.BytesIO(raw)) as archive:
        strings = [''.join(si.itertext()) for si in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        sheets = ET.fromstring(archive.read('xl/workbook.xml')).find('s:sheets', NS)
        sheet = next((s for s in sheets if sheet_name is None or s.attrib['name'] == sheet_name), None)
        if sheet is None:
            raise ValueError(f'Worksheet unavailable: {sheet_name}')
        rels = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        target = next(r.attrib['Target'] for r in rels if r.attrib['Id'] == sheet.attrib[f'{{{REL}}}id'])
        path = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        rows = []
        for row in ET.fromstring(archive.read(path)).findall('.//s:row', NS):
            values = {}
            for cell in row.findall('s:c', NS):
                value = cell.find('s:v', NS)
                if value is not None:
                    values[re.sub(r'\d+', '', cell.attrib['r'])] = strings[int(value.text)] if cell.attrib.get('t') == 's' else float(value.text)
            rows.append(values)
        return rows


def parse_gdp(raw):
    with ZipFile(io.BytesIO(raw)) as archive:
        rows = csv.DictReader(io.StringIO(archive.read('36100222.csv').decode('utf-8-sig')))
        result = []
        keys = set()
        for row in rows:
            if row['GEO'] not in REGIONS or row['Prices'] != 'Chained (2017) dollars' or row['Estimates'] != 'Gross domestic product at market prices':
                continue
            key = (REGIONS[row['GEO']], int(row['REF_DATE']))
            if key in keys or row['UOM'] != 'Dollars' or row['SCALAR_FACTOR'] != 'millions':
                raise ValueError('GDP identity or unit changed')
            keys.add(key)
            if row['STATUS'] not in ['', 'p', 'r', 'A', 'B', 'C', 'D', 'E', '0s', 'x', 'F', '..', '...']:
                raise ValueError(f"Unrecognized GDP status: {row['STATUS']}")
            status = 'available' if row['VALUE'] and row['STATUS'] not in ['x', 'F', '..', '...'] else 'not-published'
            value = float(row['VALUE']) if status == 'available' else None
            if value is not None and (not math.isfinite(value) or value <= 0):
                raise ValueError('GDP must be positive')
            result.append({'region': key[0], 'year': key[1], 'value': value, 'status': status,
                           'vector': row['VECTOR'], 'sourceStatus': row['STATUS'], 'sourceId': 'statcan-real-provincial-gdp-history'})
    if len(keys) < 500 or set(r['region'] for r in result) != set(REGIONS.values()):
        raise ValueError('GDP coverage regressed')
    return sorted(result, key=lambda r: (r['region'], r['year']))


def parse_wti(raw, cutoff_year):
    html = raw.decode('utf-8')
    if 'Cushing' not in html or 'WTI' not in html:
        raise ValueError('Unexpected WTI page')
    result = []
    for block in re.findall(r'<tr[^>]*>(.*?)</tr>', html, flags=re.S | re.I):
        decade = re.search(r"(19\d0|20\d0)'s", block)
        if not decade:
            continue
        values = re.findall(r"<td class='B3'>(.*?)</td>", block, flags=re.S)
        if len(values) != 10:
            raise ValueError('WTI decade row must contain ten year cells')
        for offset, value in enumerate(values):
            year = int(decade.group(1)) + offset
            value = unescape(value).strip()
            if value and year <= cutoff_year:
                price = float(value)
                if not math.isfinite(price) or price <= 0:
                    raise ValueError('Unexpected nonpositive annual oil price')
                result.append({'year': year, 'value': price, 'sourceId': 'eia-annual-wti-history'})
    if len(result) < 35 or len({r['year'] for r in result}) != len(result):
        raise ValueError('WTI coverage or identity failed')
    return result


def annual_shocks(raw, kind):
    rows = read_xlsx(raw, 'Monthly' if kind == 'news' else None)
    expected = {'supply': {'B': 'oil supply shocks'},
                'demand': {'B': 'economic activity shocks', 'C': 'oil consumption demand shocks', 'D': 'oil inventory demand shocks'},
                'news': {'B': 'Oil supply surprise series', 'C': 'Oil supply news shock'}}[kind]
    if not any(all(row.get(k) == v for k, v in expected.items()) for row in rows[:3]):
        raise ValueError('Structural shock worksheet labels changed')
    cols = {'supply': {'B': 'supply'}, 'demand': {'B': 'activity', 'C': 'consumption', 'D': 'inventory'}, 'news': {'C': 'news'}}[kind]
    months = {}
    for row in rows:
        date = row.get('A')
        if kind == 'news':
            if not isinstance(date, str) or not re.fullmatch(r'\d{4}M\d{2}', date):
                continue
            year, month = int(date[:4]), int(date[-2:])
        else:
            if not isinstance(date, (int, float)):
                continue
            dt = datetime(1899, 12, 30) + timedelta(days=date)
            year, month = dt.year, dt.month
        key = (year, month)
        if key in months or not 1 <= month <= 12:
            raise ValueError('Duplicate or invalid shock month')
        values = {name: row[col] for col, name in cols.items()}
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in values.values()):
            raise ValueError('Invalid structural shock value')
        months[key] = values
    if len(months) < 550:
        raise ValueError('Structural shock history regressed')
    result = {}
    for year in sorted(set(year for year, _ in months)):
        if all((year, month) in months for month in range(1, 13)):
            result[year] = {name: sum(months[(year, month)][name] for month in range(1, 13)) for name in cols.values()}
    return result, {'firstMonth': '%04d-%02d' % min(months), 'lastMonth': '%04d-%02d' % max(months), 'months': len(months)}


def solve(matrix, vector):
    """Small pivoted linear solve; singular inputs fail instead of silently fitting."""
    n = len(vector)
    a = [list(row) + [vector[i]] for i, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda row: abs(a[row][col]))
        if abs(a[pivot][col]) < 1e-10:
            raise ValueError('Singular design matrix')
        a[col], a[pivot] = a[pivot], a[col]
        divisor = a[col][col]
        a[col] = [v / divisor for v in a[col]]
        for row in range(n):
            if row != col:
                factor = a[row][col]
                a[row] = [x - factor * y for x, y in zip(a[row], a[col])]
    return [row[-1] for row in a]


def fit(x, y):
    p = len(x[0])
    return solve([[sum(row[i] * row[j] for row in x) for j in range(p)] for i in range(p)],
                 [sum(row[i] * value for row, value in zip(x, y)) for i in range(p)])


def model_rows(gdp, oil, shocks, horizon, model):
    rows = []
    for year in sorted(gdp):
        if any(y not in gdp for y in [year - 2, year - 1, year + horizon]):
            continue
        lag = 100 * math.log(gdp[year - 1] / gdp[year - 2])
        y = 100 * math.log(gdp[year + horizon] / gdp[year - 1])
        base = [1, lag]
        if model == 'price':
            if year not in oil or year - 1 not in oil:
                continue
            features = [100 * math.log(oil[year] / oil[year - 1])]
        elif model == 'structural':
            if year not in shocks or not all(k in shocks[year] for k in ['supply', 'activity', 'consumption', 'inventory']):
                continue
            features = [shocks[year][k] for k in ['supply', 'activity', 'consumption', 'inventory']]
        else:
            if year not in shocks or 'news' not in shocks[year]:
                continue
            features = [shocks[year]['news']]
        rows.append({'year': year, 'outcomeYear': year + horizon, 'x': base + features, 'baseline': base, 'y': y})
    return rows


def evaluate_model(rows, horizon, model):
    # Refit on every origin; training outcomes must end BEFORE the held-out year.
    # Post-2005 fixed evaluation start includes 2008, 2014-16 and 2020 cycles.
    minimum = 18  # Same training minimum for every candidate; three times the largest design.
    holdout = []
    for test in rows:
        train = [r for r in rows if r['outcomeYear'] < test['year']]
        if test['year'] < 2006 or len(train) < minimum:
            continue
        beta = fit([r['x'] for r in train], [r['y'] for r in train])
        base = fit([r['baseline'] for r in train], [r['y'] for r in train])
        prediction = sum(a * b for a, b in zip(test['x'], beta))
        baseline = sum(a * b for a, b in zip(test['baseline'], base))
        # Convert all scores back from log points to cumulative percent changes.
        actual_pct = 100 * math.expm1(test['y'] / 100)
        pred_pct = 100 * math.expm1(prediction / 100)
        base_pct = 100 * math.expm1(baseline / 100)
        holdout.append({'year': test['year'], 'outcomeYear': test['outcomeYear'], 'trainingRows': len(train),
                        'latestTrainingOutcomeYear': max(r['outcomeYear'] for r in train),
                        'actualPct': actual_pct, 'modelPct': pred_pct, 'baselinePct': base_pct})
    mae = statistics.mean(abs(r['modelPct'] - r['actualPct']) for r in holdout) if holdout else None
    baseline_mae = statistics.mean(abs(r['baselinePct'] - r['actualPct']) for r in holdout) if holdout else None
    rmse = math.sqrt(statistics.mean((r['modelPct'] - r['actualPct']) ** 2 for r in holdout)) if holdout else None
    improvement = 100 * (1 - mae / baseline_mae) if baseline_mae else None
    # Passing this statistical screen is necessary, not sufficient, for forecast release.
    screen = len(holdout) >= 12 and improvement is not None and improvement >= 10
    return {'model': model, 'horizonYears': horizon, 'observations': len(rows), 'minimumTrainingRows': minimum,
            'heldoutCount': len(holdout), 'maePctPoints': mae, 'baselineMaePctPoints': baseline_mae,
            'rmsePctPoints': rmse, 'improvementPct': improvement, 'passesErrorScreen': screen,
            'publicScenarioEnabled': False, 'heldout': holdout}


def build(cache, offline=False, now=None, previous=None):
    cache.mkdir(parents=True, exist_ok=True)
    stamp = now or datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    cutoff_year = datetime.fromisoformat(stamp.replace('Z', '+00:00')).year - 1
    raw = {}
    sources = []
    for source in SOURCES:
        path = cache / source['filename']
        if not offline:
            with urlopen(Request(source['downloadUrl'], headers={'User-Agent': 'Canada-in-Motion/1.0 research data refresh'}), timeout=120) as response:
                content = response.read()
            path.write_bytes(content)
        raw[source['id']] = path.read_bytes()
        sources.append({k: v for k, v in source.items() if k != 'filename'} | {'sha256': hashlib.sha256(raw[source['id']]).hexdigest()})
    hashes = {s['id']: s['sha256'] for s in sources}
    verify_file = cache / 'verification.json'
    if offline:
        verification = json.loads(verify_file.read_text()) if verify_file.exists() else None
        if not verification or verification['sourceHashes'] != hashes:
            raise ValueError('Run an online refresh once to verify these source bytes')
        retrieved = verification['retrievedAt']
    else:
        retrieved = stamp
    gdp = parse_gdp(raw['statcan-real-provincial-gdp-history'])
    oil = parse_wti(raw['eia-annual-wti-history'], cutoff_year)
    shocks, shock_coverage = {}, {}
    for source_id, kind in [('bh-2019-oil-supply-shocks', 'supply'), ('bh-2019-oil-demand-shocks', 'demand'), ('kaenzig-2021-oil-supply-news', 'news')]:
        annual, coverage = annual_shocks(raw[source_id], kind)
        shock_coverage[source_id] = coverage
        for year, values in annual.items():
            if year <= cutoff_year:
                shocks.setdefault(year, {}).update(values)
    experiments = []
    for region in REGIONS.values():
        region_gdp = {r['year']: r['value'] for r in gdp if r['region'] == region and r['status'] == 'available'}
        for horizon in [0, 1, 2]:
            candidate_rows = {model: model_rows(region_gdp, {r['year']: r['value'] for r in oil}, shocks, horizon, model)
                              for model in ['price', 'structural', 'news']}
            common_years = set.intersection(*(set(r['year'] for r in rows) for rows in candidate_rows.values()))
            for model, rows in candidate_rows.items():
                experiments.append({'region': region, **evaluate_model([r for r in rows if r['year'] in common_years], horizon, model)})
    result = {'schemaVersion': 1, 'method': 'historical-oil-gdp-paths-and-latest-vintage-local-projection-checks',
              'gdp': {'unit': 'million chained 2017 CAD', 'basis': 'GDP at market prices', 'observations': gdp},
              'oil': {'benchmark': 'WTI spot FOB', 'unit': 'nominal US$/barrel', 'frequency': 'calendar-year average', 'observations': oil},
              'structuralShockCoverage': shock_coverage,
              'structuralShocks': {'aggregation': 'Annual sum of twelve monthly published shock estimates; incomplete years are excluded.',
                                   'units': 'Author-published shock units; these are not percentage changes in WTI.',
                                   'sourceIds': {'supply': 'bh-2019-oil-supply-shocks', 'activity': 'bh-2019-oil-demand-shocks',
                                                 'consumption': 'bh-2019-oil-demand-shocks', 'inventory': 'bh-2019-oil-demand-shocks', 'news': 'kaenzig-2021-oil-supply-news'},
                                   'observations': [{'year': year, **values} for year, values in sorted(shocks.items())]},
              'experiments': experiments,
              'validation': {'kind': 'expanding-window-latest-vintage-conditional-holdout',
                             'outcome': '100 × (GDP(t+h) / GDP(t−1) − 1)',
                             'regressionOutcome': '100 × log(GDP(t+h) / GDP(t−1))',
                             'baseline': 'Intercept and one lag of annual provincial real GDP log growth; refitted at each origin',
                             'comparisonSample': 'Every candidate and its baseline use the same annual observations and held-out origins within each jurisdiction and horizon.',
                             'models': [
                                 {'id': 'price', 'label': 'WTI price change', 'features': 'Baseline plus contemporaneous annual WTI log change'},
                                 {'id': 'structural', 'label': 'Supply and demand shocks', 'features': 'Baseline plus annual sums of all four Baumeister–Hamilton posterior median structural shocks'},
                                 {'id': 'news', 'label': 'OPEC supply news', 'features': 'Baseline plus annual sum of Känzig oil supply news shocks'}],
                             'errorUnit': 'percentage points of cumulative real GDP change',
                             'errorScreen': 'At least 12 held-out years and 10% lower mean absolute error than the no-oil baseline',
                             'limitations': ['Uses revised GDP and the latest available estimated shock vintages, not data available at historical release dates.',
                                             'Oil prices and identified shocks in the held-out year are treated as observed inputs; these are conditional checks, not advance forecasts.',
                                             'Annual aggregation does not identify the within-year timing of shocks. Shock-model identification and posterior uncertainty are not propagated.',
                                             'No model coefficients are selected or tuned on the holdout scores. Error-screen thresholds are application release criteria, not claims from the cited papers.']},
              'forecastGate': {'enabled': False, 'status': 'research-only',
                               'reason': 'Historical episodes are available. A validated conversion from an arbitrary oil-price change to a provincial GDP forecast is not.',
                               'requirements': ['Identify the supply or demand intervention and validate its mapping to the chosen WTI price path.',
                                                'Propagate shock-identification, parameter and future-outcome uncertainty.',
                                                'Validate with historical data vintages and independent provincial review before enabling forecasts.']},
              'limitations': ['The observed GDP changes include every economic influence during those years; they are not effects caused only by oil.',
                              'Nominal US-dollar WTI changes are compared with real Canadian-dollar GDP growth. No exchange-rate or inflation-adjusted oil-price equivalence is implied.',
                              'GDP is expenditure-based at market prices, distinct from the basic-price energy GDP in the income view.',
                              'Northwest Territories and Nunavut histories begin in 1999. Earlier combined-territory figures are not reassigned to either jurisdiction.',
                              'Nearest episodes are chosen only by the annual oil-price change, not economic similarity or the sign of subsequent GDP.'],
              'sources': sources,
              'literature': [{'title': 'Estimation and Inference of Impulse Responses by Local Projections', 'authors': 'Òscar Jordà', 'year': 2005, 'url': 'https://www.aeaweb.org/articles?id=10.1257/0002828053828518'},
                             {'title': 'Not All Oil Price Shocks Are Alike', 'authors': 'Lutz Kilian', 'year': 2009, 'url': 'https://www.aeaweb.org/articles?id=10.1257/aer.99.3.1053'},
                             {'title': 'Structural Interpretation of Vector Autoregressions with Incomplete Identification', 'authors': 'Christiane Baumeister and James D. Hamilton', 'year': 2019, 'url': 'https://www.aeaweb.org/articles?id=10.1257/aer.20151569'},
                             {'title': 'The Macroeconomic Effects of Oil Supply News', 'authors': 'Diego R. Känzig', 'year': 2021, 'url': 'https://www.aeaweb.org/articles?id=10.1257/aer.20190964'}]}
    result['dataVersion'] = hashlib.sha256(json.dumps(result, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()[:20]
    result['generatedAt'] = previous['generatedAt'] if previous and previous.get('dataVersion') == result['dataVersion'] else stamp
    result['retrievedAt'] = retrieved
    if not offline:
        verify_file.write_text(json.dumps({'sourceHashes': hashes, 'retrievedAt': stamp}) + '\n')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=ROOT / '.data-cache/dynamic-price')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/dynamic-price-history.json')
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    previous = json.loads(args.output.read_text()) if args.output.exists() else None
    result = build(args.cache, args.offline, previous=previous)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=args.output.parent, delete=False) as stream:
        json.dump(result, stream, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
        stream.write('\n')
        tmp = Path(stream.name)
    tmp.replace(args.output)
    print(json.dumps({'dataVersion': result['dataVersion'], 'gdpObservations': len(result['gdp']['observations']),
                      'candidateModels': len(result['experiments']), 'passErrorScreen': sum(r['passesErrorScreen'] for r in result['experiments']),
                      'forecastsEnabled': result['forecastGate']['enabled']}))


if __name__ == '__main__':
    main()
