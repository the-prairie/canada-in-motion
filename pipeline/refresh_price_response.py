"""Conditional provincial GDP associations with annual energy-price changes."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import random
import re
import statistics
import tempfile
from urllib.request import Request, urlopen

from refresh_dynamic_price import solve

ROOT = Path(__file__).resolve().parents[1]
REGIONS = ['NL', 'PE', 'NS', 'NB', 'QC', 'ON', 'MB', 'SK', 'AB', 'BC', 'YT', 'NT', 'NU']
PROVINCES = REGIONS[:10]
GROUPS = {'oil': {'AB', 'SK', 'NL'}, 'gas': {'AB', 'BC', 'SK'}}
VARIANTS = [('own', 1), ('half-pool', .5), ('pool', 0)]
MIN_TRAIN = {'oil': 18, 'gas': 12}
MIN_SELECTION = 5
BOOTSTRAP_REPLICATES = 400
BOOTSTRAP_BLOCK = 3
SOURCES = [
    {'id': 'eia-henry-hub-annual', 'title': 'Henry Hub natural gas spot price, annual',
     'publisher': 'US Energy Information Administration', 'url': 'https://www.eia.gov/dnav/ng/hist/rngwhhdA.htm',
     'filename': 'henry-hub-annual.html', 'license': 'US government public data',
     'licenseUrl': 'https://www.eia.gov/about/copyrights_reuse.php'},
    {'id': 'eia-henry-hub-monthly', 'title': 'Henry Hub natural gas spot price, monthly',
     'publisher': 'US Energy Information Administration', 'url': 'https://www.eia.gov/dnav/ng/hist/rngwhhdM.htm',
     'filename': 'henry-hub-monthly.html', 'license': 'US government public data',
     'licenseUrl': 'https://www.eia.gov/about/copyrights_reuse.php'},
]


def parse_gas(annual, monthly, cutoff):
    if 'Henry Hub Natural Gas Spot Price' not in annual or 'Henry Hub Natural Gas Spot Price' not in monthly:
        raise ValueError('Unexpected natural gas source')
    prices = {}
    for block in re.findall(r'<tr[^>]*>(.*?)</tr>', annual, re.S | re.I):
        match = re.search(r"(19\d0|20\d0)'s", block)
        if not match:
            continue
        cells = re.findall(r"<td class='B3'>(.*?)</td>", block, re.S)
        if len(cells) != 10:
            raise ValueError('Annual gas decade layout changed')
        for offset, value in enumerate(cells):
            year = int(match.group(1)) + offset
            if value.strip() and year <= cutoff:
                if year in prices:
                    raise ValueError('Duplicate annual natural gas year')
                prices[year] = {'commodity': 'gas', 'year': year, 'value': float(value),
                                'sourceId': 'eia-henry-hub-annual', 'aggregation': 'published annual average'}
    monthly_history = []
    monthly_years = set()
    for block in re.findall(r'<tr[^>]*>(.*?)</tr>', monthly, re.S | re.I):
        match = re.search(r"class='B4'>.*?((?:19|20)\d\d)</td>", block)
        cells = re.findall(r"<td class='B3'>(.*?)</td>", block, re.S)
        if not match:
            continue
        year = int(match.group(1))
        if len(cells) != 12:
            raise ValueError('Monthly gas year layout changed')
        if year > cutoff:
            continue
        if year in monthly_years:
            raise ValueError('Duplicate monthly natural gas year')
        monthly_years.add(year)
        values = [float(value) if value.strip() else None for value in cells]
        if any(v is not None and (not math.isfinite(v) or v <= 0) for v in values):
            raise ValueError('Invalid monthly natural gas price')
        monthly_history.extend({'year': year, 'month': month, 'value': value, 'sourceId': 'eia-henry-hub-monthly'}
                               for month, value in enumerate(values, 1) if value is not None)
        if year not in prices and all(value is not None for value in values):
            prices[year] = {'commodity': 'gas', 'year': year, 'value': statistics.mean(values),
                            'sourceId': 'eia-henry-hub-monthly', 'aggregation': 'mean of 12 monthly averages',
                            'reason': 'Annual source value absent; derived from twelve published monthly means.'}
    if len(prices) < 25 or any(not math.isfinite(r['value']) or r['value'] <= 0 for r in prices.values()):
        raise ValueError('Natural gas source coverage or values failed')
    return sorted(prices.values(), key=lambda r: r['year']), monthly_history


def fit(rows, columns):
    ybar = statistics.mean(r['y'] for r in rows)
    if not columns:
        return {'intercept': ybar, 'coefficients': {}}
    centers = [statistics.mean(r[c] for r in rows) for c in columns]
    scales = [math.sqrt(statistics.mean((r[c] - centers[i]) ** 2 for r in rows)) or 1 for i, c in enumerate(columns)]
    z = [[(r[c] - centers[i]) / scales[i] for i, c in enumerate(columns)] for r in rows]
    beta = solve([[sum(x[i] * x[j] for x in z) for j in range(len(columns))] for i in range(len(columns))],
                 [sum(x[i] * (r['y'] - ybar) for x, r in zip(z, rows)) for i in range(len(columns))])
    slopes = [beta[i] / scales[i] for i in range(len(columns))]
    return {'intercept': ybar - sum(x * y for x, y in zip(slopes, centers)),
            'coefficients': dict(zip(columns, slopes))}


def pooled_fit(rows, region, columns):
    regions = sorted({r['region'] for r in rows})
    centers = {r: {k: statistics.mean(x[k] for x in rows if x['region'] == r) for k in ['y'] + columns} for r in regions}
    centered = [{k: row[k] - centers[row['region']][k] for k in ['y'] + columns} for row in rows]
    model = fit(centered, columns)
    return {'intercept': centers[region]['y'] - sum(v * centers[region][k] for k, v in model['coefficients'].items()),
            'coefficients': model['coefficients']}


def blend(own, pooled, weight):
    return {'intercept': weight * own['intercept'] + (1 - weight) * pooled['intercept'],
            'coefficients': {k: weight * v + (1 - weight) * pooled['coefficients'][k] for k, v in own['coefficients'].items()}}


def candidate_fits(own, peers, region, columns):
    local = fit(own, columns)
    if region not in PROVINCES:
        return {'own': local}
    pooled = pooled_fit(peers, region, columns)
    return {name: blend(local, pooled, weight) for name, weight in VARIANTS}


def predict(model, row):
    return 100 * math.expm1((model['intercept'] + sum(v * row[k] for k, v in model['coefficients'].items())) / 100)


def make_rows(gdp, prices, region, horizon):
    series = {r['year']: r['value'] for r in gdp if r['region'] == region and r['status'] == 'available'}
    rows = []
    for year, value in prices.items():
        if year - 1 not in prices or any(y not in series for y in [year - 2, year - 1, year + horizon]):
            continue
        rows.append({'region': region, 'year': year, 'outcomeYear': year + horizon,
                     'y': 100 * math.log(series[year + horizon] / series[year - 1]),
                     'lagGrowth': 100 * math.log(series[year - 1] / series[year - 2]),
                     'price': 100 * math.log(value / prices[year - 1])})
    return sorted(rows, key=lambda r: r['year'])


def choose(prior, field, variants):
    if len(prior) < MIN_SELECTION:
        return 'own'
    return min(variants, key=lambda name: statistics.mean(abs(r[field][name] - r['actualPct']) for r in prior))


def metrics(records):
    if not records:
        return None
    names = [('modelPct', 'maePctPoints', 'rmsePctPoints'),
             ('baselineMeanPct', 'baselineMeanMaePctPoints', 'baselineMeanRmsePctPoints'),
             ('baselineArPct', 'baselineArMaePctPoints', 'baselineArRmsePctPoints')]
    result = {'count': len(records), 'firstYear': min(r['year'] for r in records), 'lastYear': max(r['year'] for r in records)}
    for key, mae, rmse in names:
        errors = [r[key] - r['actualPct'] for r in records]
        result[mae] = statistics.mean(abs(e) for e in errors)
        result[rmse] = math.sqrt(statistics.mean(e * e for e in errors))
    result['baselineMaePctPoints'] = min(result['baselineMeanMaePctPoints'], result['baselineArMaePctPoints'])
    result['baselineRmsePctPoints'] = min(result['baselineMeanRmsePctPoints'], result['baselineArRmsePctPoints'])
    result['improvementPct'] = 100 * (1 - result['maePctPoints'] / result['baselineMaePctPoints'])
    return result


def empirical_radius(records):
    if len(records) < 5:
        return None
    errors = sorted(abs(r['modelPct'] - r['actualPct']) for r in records)
    return errors[min(len(errors) - 1, math.ceil(.8 * (len(errors) + 1)) - 1)]


def parameter_range(own, peers, region, variant, seed, replicates=BOOTSTRAP_REPLICATES):
    years = sorted({r['year'] for r in own})
    blocks = [years[i:i + BOOTSTRAP_BLOCK] for i in range(len(years) - BOOTSTRAP_BLOCK + 1)
              if years[i + BOOTSTRAP_BLOCK - 1] - years[i] == BOOTSTRAP_BLOCK - 1]
    if not blocks:
        raise ValueError('No contiguous bootstrap blocks')
    rng = random.Random(seed)
    samples = []
    failures = 0
    for _ in range(replicates):
        selected = []
        while len(selected) < len(years):
            selected.extend(rng.choice(blocks))
        selected = selected[:len(years)]
        sample_own = [row for year in selected for row in own if row['year'] == year]
        sample_peers = [row for year in selected for row in peers if row['year'] == year]
        try:
            samples.append(candidate_fits(sample_own, sample_peers, region, ['lagGrowth', 'price'])[variant]['coefficients']['price'])
        except ValueError:
            failures += 1
    if len(samples) < .95 * replicates:
        raise ValueError('Bootstrap fits failed')
    samples.sort()
    return {'level': .8, 'low': samples[math.floor(.1 * (len(samples) - 1))],
            'high': samples[math.ceil(.9 * (len(samples) - 1))],
            'method': 'moving-block pairs bootstrap, common three-year blocks across peer provinces',
            'replicates': replicates, 'successfulFits': len(samples), 'failedFits': failures,
            'blockYears': BOOTSTRAP_BLOCK, 'seed': seed,
            'scope': 'Parameter uncertainty conditional on selected model; excludes model-selection, identification and future-outcome uncertainty.'}


def build_model(gdp, prices, commodity, region, horizon, bootstrap_replicates=BOOTSTRAP_REPLICATES):
    rows = make_rows(gdp, prices, region, horizon)
    if region not in PROVINCES:
        group = {region}
    else:
        group = GROUPS[commodity] if region in GROUPS[commodity] else set(PROVINCES) - GROUPS[commodity]
    peers = [row for r in sorted(group) for row in make_rows(gdp, prices, r, horizon)]
    records = []
    for row in rows:
        own = [r for r in rows if r['outcomeYear'] < row['year']]
        train = [r for r in peers if r['outcomeYear'] < row['year']]
        if row['year'] < 2006 or len(own) < MIN_TRAIN[commodity]:
            continue
        candidates = candidate_fits(own, train, region, ['lagGrowth', 'price'])
        baselines = candidate_fits(own, train, region, ['lagGrowth'])
        prior = [r for r in records if r['outcomeYear'] < row['year']]
        selected = choose(prior, 'candidatePredictions', candidates)
        selected_ar = choose(prior, 'baselineCandidates', baselines)
        actual = 100 * math.expm1(row['y'] / 100)
        prediction = predict(candidates[selected], row)
        radius = empirical_radius(prior)
        records.append({'year': row['year'], 'outcomeYear': row['outcomeYear'], 'actualPct': actual,
                        'modelPct': prediction, 'baselineMeanPct': predict(fit(own, []), row),
                        'baselineArPct': predict(baselines[selected_ar], row),
                        'trainingEnd': max(r['outcomeYear'] for r in train),
                        'trainingRows': len(own), 'peerTrainingRows': len(train),
                        'latestSelectionOutcomeYear': max(r['outcomeYear'] for r in prior) if prior else None,
                        'selectionCount': len(prior), 'variant': selected, 'baselineVariant': selected_ar,
                        'coefficient': candidates[selected]['coefficients']['price'],
                        'candidatePredictions': {name: predict(model, row) for name, model in candidates.items()},
                        'baselineCandidates': {name: predict(model, row) for name, model in baselines.items()},
                        'rangeRadiusPctPoints': radius,
                        'rangeCovered': abs(prediction - actual) <= radius if radius is not None else None})
    final_candidates = candidate_fits(rows, peers, region, ['lagGrowth', 'price'])
    variant = choose(records, 'candidatePredictions', final_candidates)
    final = final_candidates[variant]
    coefficient = final['coefficients']['price']
    scores = metrics(records)
    eras = {
        'before2015': metrics([r for r in records if r['year'] < 2015]),
        'from2015': metrics([r for r in records if r['year'] >= 2015]),
        'excludePandemic': metrics([r for r in records if not any(y in [2020, 2021] for y in range(r['year'], r['outcomeYear'] + 1))]),
    }
    sign_share = statistics.mean(math.copysign(1, r['coefficient']) == math.copysign(1, coefficient) for r in records) if records else 0
    criteria = {
        'heldoutMinimum': len(records) >= 12,
        'maeImprovement': scores is not None and scores['improvementPct'] >= 5,
        'rmseNoWorse': scores is not None and scores['rmsePctPoints'] <= scores['baselineRmsePctPoints'],
        'nonPandemicGain': eras['excludePandemic'] is not None and eras['excludePandemic']['improvementPct'] > 0,
        'recentGain': eras['from2015'] is not None and eras['from2015']['improvementPct'] >= 0,
        'stableSign': sign_share >= .8,
    }
    calibrated = [r for r in records if r['rangeCovered'] is not None]
    seed = int(hashlib.sha256(f'{region}/{commodity}/{horizon}'.encode()).hexdigest()[:8], 16)
    uncertainty = parameter_range(rows, peers, region, variant, seed, bootstrap_replicates)
    return {'region': region, 'commodity': commodity, 'horizonYears': horizon,
            'coefficient': coefficient, 'parameterRange': uncertainty, 'heldoutCount': len(records),
            'fit': {**final, 'variant': variant, 'peerRegions': sorted(group), 'trainingRows': len(rows),
                    'peerTrainingRows': len(peers), 'firstPriceYear': rows[0]['year'], 'lastOutcomeYear': rows[-1]['outcomeYear'],
                    'variantCoefficients': {name: model['coefficients']['price'] for name, model in final_candidates.items()}},
            'validation': {'kind': 'expanding-window-latest-vintage-conditional-holdout', **(scores or {}),
                           'eras': eras, 'criteria': criteria, 'passesScreen': all(criteria.values()),
                           'coefficientSignShare': sign_share,
                           'outcomeRange': {'targetCoverage': .8, 'radiusPctPoints': empirical_radius(records),
                                            'heldoutCoverage': statistics.mean(r['rangeCovered'] for r in calibrated) if calibrated else None,
                                            'calibratedCount': len(calibrated)}},
            'heldout': records, 'sourceIds': ['statcan-real-provincial-gdp-history', 'eia-annual-wti-history'] if commodity == 'oil' else
            ['statcan-real-provincial-gdp-history', 'eia-henry-hub-annual', 'eia-henry-hub-monthly']}


def build(cache, offline=False, history=None, now=None, bootstrap_replicates=BOOTSTRAP_REPLICATES):
    history = history or json.loads((ROOT / 'data/dynamic-price-history.json').read_text())
    stamp = now or datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    cutoff = datetime.fromisoformat(stamp.replace('Z', '+00:00')).year - 1
    cache.mkdir(parents=True, exist_ok=True)
    raw, sources = {}, []
    for source in SOURCES:
        path = cache / source['filename']
        if not offline:
            with urlopen(Request(source['url'], headers={'User-Agent': 'Canada-in-Motion public research data pipeline/1.0'}), timeout=120) as response:
                path.write_bytes(response.read())
        raw[source['id']] = path.read_bytes()
        sources.append({k: v for k, v in source.items() if k != 'filename'} | {'sha256': hashlib.sha256(raw[source['id']]).hexdigest()})
    hashes = {s['id']: s['sha256'] for s in sources}
    verification_path = cache / 'verification.json'
    if offline:
        verification = json.loads(verification_path.read_text())
        if verification['sourceHashes'] != hashes:
            raise ValueError('Natural gas cache is not the verified source version')
        retrieved = verification['retrievedAt']
    else:
        retrieved = stamp
        verification_path.write_text(json.dumps({'sourceHashes': hashes, 'retrievedAt': retrieved}) + '\n')
    gas, monthly = parse_gas(raw['eia-henry-hub-annual'].decode(), raw['eia-henry-hub-monthly'].decode(), cutoff)
    oil = [{**r, 'commodity': 'oil', 'aggregation': 'published annual average'} for r in history['oil']['observations'] if r['year'] <= cutoff]
    gdp = [r for r in history['gdp']['observations'] if r['region'] in REGIONS and r['year'] <= cutoff]
    sources = [s for s in history['sources'] if s['id'] in ['statcan-real-provincial-gdp-history', 'eia-annual-wti-history']] + sources
    models = [build_model(gdp, {r['year']: r['value'] for r in series}, commodity, region, horizon, bootstrap_replicates)
              for commodity, series in [('oil', oil), ('gas', gas)] for region in REGIONS for horizon in [0, 1]]
    result = {
        'schemaVersion': 1, 'method': 'conditional-historical-energy-price-response',
        'inputDataVersion': history['dataVersion'], 'sources': sources,
        'history': {'gdp': gdp, 'prices': oil + gas, 'gasMonthly': monthly},
        'benchmarks': {
            'oil': {'label': 'WTI spot FOB', 'unit': 'nominal US$/barrel', 'frequency': 'calendar-year average'},
            'gas': {'label': 'Henry Hub spot', 'unit': 'nominal US$/MMBtu', 'frequency': 'calendar-year average',
                    'limitation': 'US wholesale benchmark; not AECO, a provincial retail tariff or the price received by every Canadian producer.'},
        },
        'models': models,
        'unsupported': [{'commodity': 'electricity',
                         'reason': 'A single electricity price change does not identify the provincial market, regulated tariff, fuel cost or generation constraint. No common national electricity-to-GDP coefficient is estimated.',
                         'sourceUrls': ['https://www.cer-rec.gc.ca/en/data-analysis/energy-commodities/electricity/',
                                        'https://www.aeso.ca/market/market-and-system-reporting/']}],
        'methodology': {
            'outcome': '100 × log(real GDP at market prices in t+h / real GDP in t−1), million chained 2017 CAD levels',
            'features': 'Intercept, previous annual real GDP log growth and annual nominal US-dollar energy-price log change',
            'interpretation': 'Conditional historical association. The response compares the fitted GDP level under a price change with the same fitted model under an unchanged price. It is not a causal impact or an adjustment to the independent provincial forecast.',
            'responseFormula': '100 × expm1(coefficient × log1p(priceChangePct / 100))',
            'horizons': [{'years': 0, 'label': 'Price-change year'}, {'years': 1, 'label': 'Through the following year'}],
            'pricePath': 'The regressor changes the price-change year annual average. Later energy prices are unconditioned. Horizons do not represent a persistent or temporary price-path intervention.',
            'variants': ['Own-province OLS', 'Equal blend of own and peer-group pooled slopes', 'Peer-group pooled slopes with province intercepts'],
            'groups': {k: {'producing': sorted(v), 'otherProvinces': sorted(set(PROVINCES) - v)} for k, v in GROUPS.items()},
            'groupRule': 'Fixed research groups for principal oil-producing provinces and Western Canadian gas-producing provinces. No group is chosen from GDP fit scores. Territories use own-region models.',
            'selection': 'At each historical origin, choose the price-model variant with lowest mean absolute error over earlier origins whose GDP outcome year has ended. Use own-province OLS until five such evaluations exist. Choose the no-price AR variant separately by the same rule. Final fit uses all completed evaluations.',
            'training': 'Training outcomes end strictly before the held-out price-change year. Minimum own-province rows are 18 for oil and 12 for gas. Evaluation begins no earlier than 2006.',
            'validationScope': 'The held-out year energy price is treated as already observed. These are conditional historical tests using latest-vintage GDP, not forecasts available at the start of that year or vintage-real-time tests.',
            'screen': {'minimumHeldout': 12, 'minimumMaeImprovementPct': 5, 'maximumRmseRatio': 1,
                       'nonPandemicImprovementRequired': True, 'recentImprovementRequired': True, 'minimumSignShare': .8},
            'screenInterpretation': 'An application evidence screen, not proof of causality or future accuracy. It compares with both a historical mean and a separately selected no-price autoregression; all attempts remain published.',
            'rangeInterpretation': 'Parameter ranges hold the selected model fixed. Separate outcome-error ranges come from previous conditional prediction errors. They must not be exchanged or called causal confidence bounds.',
            'limitations': [
                'Supply and demand causes of energy prices are not identified. Global activity, exchange rates, weather, fiscal changes and other common influences can explain associations.',
                'The annual data sample is small. The grouping and candidate family were researched using this history; nested selection prevents future outcomes entering an origin but cannot erase research design reuse.',
                'Revised historical GDP and current data vintages are used. No historical release-vintage database is reconstructed.',
                'The 80% bootstrap range excludes model-selection uncertainty. The empirically targeted 80% outcome range does not guarantee 80% future coverage.',
                'Nominal US-dollar benchmark changes are associated with real Canadian-dollar GDP. They do not estimate the effect of an isolated exchange-rate-adjusted domestic price intervention.',
                'The following-year outcome accumulates GDP changes across two years. It does not assume the initial price change persists.',
            ],
            'literature': [
                {'title': 'Not All Oil Price Shocks Are Alike', 'url': 'https://www.aeaweb.org/articles?id=10.1257/aer.99.3.1053'},
                {'title': 'How Oil Supply Shocks Affect the Global Economy: Evidence from Local Projections', 'url': 'https://www.bankofcanada.ca/2019/07/staff-discussion-paper-2019-6/'},
                {'title': 'Production Networks and the Propagation of Commodity Price Shocks', 'url': 'https://www.bankofcanada.ca/2020/11/staff-working-paper-2020-44/'},
                {'title': 'The Propagation of Regional Shocks in Housing Markets: Evidence from Oil Price Shocks in Canada', 'url': 'https://www.bankofcanada.ca/2018/11/staff-working-paper-2018-56/'},
            ],
        },
    }
    result['dataVersion'] = hashlib.sha256(json.dumps(result, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()[:20]
    result['generatedAt'] = stamp
    result['retrievedAt'] = min(retrieved, history['retrievedAt'])
    result['sourceRetrievals'] = {s['id']: retrieved if s['id'].startswith('eia-henry-hub') else history['retrievedAt'] for s in sources}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=ROOT / '.data-cache/price-response')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/provincial-price-response.json')
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    result = build(args.cache, args.offline)
    if args.output.exists():
        old = json.loads(args.output.read_text())
        if old.get('dataVersion') == result['dataVersion']:
            result['generatedAt'] = old['generatedAt']
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=args.output.parent, delete=False) as handle:
        json.dump(result, handle, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
        handle.write('\n')
        path = Path(handle.name)
    path.replace(args.output)
    print(json.dumps({'dataVersion': result['dataVersion'], 'models': len(result['models']),
                      'passScreen': sum(r['validation']['passesScreen'] for r in result['models'])}))


if __name__ == '__main__':
    main()
