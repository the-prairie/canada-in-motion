#!/usr/bin/env python3
"""Reproduce the energy/GDP experiment without importing its parser or model.

Use --raw-dir with independently downloaded StatCan archives to verify source
identity, physical totals, fitted forecasts, selection and the release decision.
"""
import argparse
import csv
from decimal import Decimal
import hashlib
import io
import json
import math
from pathlib import Path
from statistics import mean
import zipfile

ROOT = Path(__file__).resolve().parents[2]
PROVINCES = ['NL', 'PE', 'NS', 'NB', 'QC', 'ON', 'MB', 'SK', 'AB', 'BC']
SPECS = {
    'oil': ('25100063', {'Supply and disposition': 'Crude oil production', 'Units of measure': 'Cubic metres'}, 'Cubic metres', 'units', 1),
    'gas': ('25100086', {'Supply and disposition': 'Marketable production, supply', 'Unit of measure': 'Gigajoules'}, 'Gigajoules', 'thousands', 1000),
    'electricity': ('25100015', {'Class of electricity producer': 'Total all classes of electricity producer', 'Type of electricity generation': 'Total all types of electricity generation'}, 'Megawatt hours', 'units', 1),
}
CANDIDATES = ['oil-residual', 'gas-residual', 'electricity-residual', 'equal-energy-residual']


def source_features(raw_dir, snapshot):
    regions = {r['name']: r['code'] for r in snapshot['regions']}
    features, hashes = {}, {}
    for metric, (table, selectors, unit, scale, multiplier) in SPECS.items():
        raw = (raw_dir / (table + '-eng.zip')).read_bytes()
        hashes['statcan-' + table] = hashlib.sha256(raw).hexdigest()
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            rows = csv.DictReader(io.StringIO(archive.read(table + '.csv').decode('utf-8-sig')))
            index = {}
            for row in rows:
                if not all(row[k] == value for k, value in selectors.items()) or row['GEO'] not in regions:
                    continue
                assert row['UOM'] == unit and row['SCALAR_FACTOR'] == scale
                key = regions[row['GEO']], row['REF_DATE']
                assert key not in index
                withheld = {row['STATUS'], row['SYMBOL']}.intersection({'x', '..', '...', 'F'})
                index[key] = float(Decimal(row['VALUE']) * multiplier) if row['VALUE'] and not withheld else None
        first_year = min(int(month[:4]) for _, month in index)
        for region in PROVINCES:
            for year in range(first_year, snapshot['forecastOriginYear'] + 1):
                current = [index.get((region, f'{year}-{month:02d}')) for month in range(1, 8)]
                previous = [index.get((region, f'{year - 1}-{month:02d}')) for month in range(1, 8)]
                a = sum(current) if None not in current else None
                b = sum(previous) if None not in previous else None
                status = 'available' if a is not None and b is not None else 'incomplete-source-months'
                if metric == 'electricity' and year == 2016:
                    status = 'source-coverage-break'
                if a is not None and b is not None and b <= 0:
                    status = 'zero-prior-total'
                features[metric, region, year] = {'currentTotal': a, 'previousTotal': b, 'growthPct': 100 * (a / b - 1) if status == 'available' else None, 'status': status}
    return features, hashes


def ridge_prediction(rows, region, inputs, columns):
    groups = {r: [x for x in rows if x['region'] == r] for r in {x['region'] for x in rows}}
    centres = {r: ([mean(x['features'][column] for x in group) for column in columns], mean(x['actual'] for x in group)) for r, group in groups.items()}
    dx = [[row['features'][column] - centres[row['region']][0][i] for i, column in enumerate(columns)] for row in rows]
    dy = [row['actual'] - centres[row['region']][1] for row in rows]
    n = len(rows)
    scales = [math.sqrt(sum(x[i] ** 2 for x in dx) / n) or 1 for i in range(len(columns))]
    normalized = [[x[i] / scales[i] for i in range(len(columns))] for x in dx]
    rhs = [sum(x[i] * y for x, y in zip(normalized, dy)) for i in range(len(columns))]
    matrix = [[sum(x[i] * x[j] for x in normalized) + (n if i == j else 0) for j in range(len(columns))] for i in range(len(columns))]
    if len(columns) == 1:
        beta = [rhs[0] / matrix[0][0]]
    else:
        a, b = matrix[0]
        c, d = matrix[1]
        determinant = a * d - b * c
        beta = [(d * rhs[0] - b * rhs[1]) / determinant, (-c * rhs[0] + a * rhs[1]) / determinant]
    return centres[region][1] + sum(beta[i] / scales[i] * (inputs[column] - centres[region][0][i]) for i, column in enumerate(columns))


def reproduce_incumbent(snapshot):
    gdp = {(x['region'], x['year']): x['value'] for x in snapshot['history']['gdp'] if x['status'] == 'available'}
    employment = {(x['region'], x['month']): x['value'] for x in snapshot['history']['employment'] if x['status'] == 'available'}
    features = {}
    for region in PROVINCES:
        for year in range(min(y for _, y in gdp) + 2, snapshot['forecastOriginYear'] + 1):
            if (region, year - 1) not in gdp or (region, year - 2) not in gdp:
                continue
            current = [employment.get((region, f'{year}-{m:02d}')) for m in range(1, 10)]
            previous = [employment.get((region, f'{year - 1}-{m:02d}')) for m in range(1, 10)]
            if None not in current + previous:
                features[region, year] = [100 * (gdp[region, year - 1] / gdp[region, year - 2] - 1), 100 * (sum(current) / sum(previous) - 1)]
    def actual(region, year):
        return 100 * (gdp[region, year] / gdp[region, year - 1] - 1) if (region, year) in gdp and (region, year - 1) in gdp else None
    records = {}
    for horizon in [0, 1]:
        rows = [{'region': r, 'origin': y, 'target': y + horizon, 'features': x, 'actual': actual(r, y + horizon)} for (r, y), x in features.items() if actual(r, y + horizon) is not None]
        for region in PROVINCES:
            prior = []
            for origin in sorted(y for r, y in features if r == region):
                train = [x for x in rows if x['target'] < origin]
                own = [x for x in train if x['region'] == region]
                if len(own) < 10:
                    continue
                x = features[region, origin]
                candidates = {'historical-mean': mean(row['actual'] for row in own), 'shrunk-autoregression': ridge_prediction(own, region, x, [0]), 'employment-bridge': ridge_prediction(own, region, x, [0, 1]), 'pooled-employment-bridge': ridge_prediction(train, region, x, [0, 1])}
                visible = [r for r in prior if r['targetYear'] < origin]
                selected = 'historical-mean'
                if len(visible) >= 5:
                    scores = {name: mean(abs(r['candidates'][name] - r['actualPct']) for r in visible) for name in candidates}
                    best = min(scores, key=scores.get)
                    if scores[best] < .95 * scores['historical-mean']:
                        selected = best
                prediction = candidates[selected]
                errors = sorted(abs(r['baselinePct'] - r['actualPct']) for r in visible)
                radius = errors[min(len(errors), math.ceil((len(errors) + 1) * .8)) - 1] if len(errors) >= 5 else None
                record = {'region': region, 'horizon': horizon, 'originYear': origin, 'targetYear': origin + horizon, 'baselinePct': prediction, 'incumbentModel': selected, 'candidates': candidates, 'actualPct': actual(region, origin + horizon), 'radius': radius}
                records[region, horizon, origin] = record
                if record['actualPct'] is not None:
                    prior.append(record)
    return records


def reproduce_energy(records, features):
    result = {}
    available = {key: value['growthPct'] for key, value in features.items() if value['status'] == 'available'}
    for key, row in records.items():
        region, horizon, origin = key
        corrections = {}
        for metric in SPECS:
            train = [r for r in records.values() if r['horizon'] == horizon and r['targetYear'] < origin and r['actualPct'] is not None and (metric, r['region'], r['originYear']) in available]
            eligible = {r for r in PROVINCES if len({x['targetYear'] for x in train if x['region'] == r}) >= 5}
            train = [r for r in train if r['region'] in eligible]
            if (metric, region, origin) not in available or region not in eligible or len(eligible) < 4 or len({r['targetYear'] for r in train}) < 5:
                corrections[metric] = None
                continue
            centres = {r: (mean(available[metric, x['region'], x['originYear']] for x in train if x['region'] == r), mean(x['actualPct'] - x['baselinePct'] for x in train if x['region'] == r)) for r in eligible}
            dx = [available[metric, r['region'], r['originYear']] - centres[r['region']][0] for r in train]
            dy = [r['actualPct'] - r['baselinePct'] - centres[r['region']][1] for r in train]
            ss = sum(x * x for x in dx)
            slope = sum(x * y for x, y in zip(dx, dy)) / (2 * ss) if ss else 0
            change = .5 * max(-1, min(1, slope * (available[metric, region, origin] - centres[region][0])))
            corrections[metric] = {'deltaPp': change, 'coefficient': slope, 'inputGrowthPct': available[metric, region, origin]}
        predictions = {metric + '-residual': row['baselinePct'] + correction['deltaPp'] for metric, correction in corrections.items() if correction is not None}
        if predictions:
            predictions['equal-energy-residual'] = mean(predictions.values())
        result[key] = {**row, 'corrections': corrections, 'candidatePredictions': predictions}
    for row in result.values():
        scores = {}
        for name in CANDIDATES:
            if name not in row['candidatePredictions']:
                continue
            prior = [r for r in result.values() if r['region'] == row['region'] and r['horizon'] == row['horizon'] and r['targetYear'] < row['originYear'] and r['actualPct'] is not None and name in r['candidatePredictions']]
            if len({r['targetYear'] for r in prior}) < 3:
                continue
            ae = [r['candidatePredictions'][name] - r['actualPct'] for r in prior]
            be = [r['baselinePct'] - r['actualPct'] for r in prior]
            if mean(abs(x) for x in ae) <= .95 * mean(abs(x) for x in be) and mean(x * x for x in ae) <= mean(x * x for x in be):
                scores[name] = {'mae': mean(abs(x) for x in ae), 'count': len(prior), 'maxTargetYear': max(r['targetYear'] for r in prior)}
        selected = min(scores, key=lambda k: scores[k]['mae']) if scores else 'incumbent'
        row.update({'selected': selected, 'selectionScores': scores, 'experimentalPct': row['baselinePct'] if selected == 'incumbent' else row['candidatePredictions'][selected]})
    return result


def audit(snapshot, raw_dir):
    evaluation = snapshot['energyEvaluation']
    assert evaluation['status'] == 'evaluated' and evaluation['adopted'] is False
    features, hashes = source_features(raw_dir, snapshot)
    assert hashes == {r['id']: r['sha256'] for r in evaluation['sources']}
    expected = reproduce_energy(reproduce_incumbent(snapshot), features)
    numeric = 0
    def close(a, b, label):
        nonlocal numeric
        assert math.isclose(a, b, rel_tol=1e-10, abs_tol=1e-10), (label, a, b)
        numeric += 1
    for row in evaluation['features']:
        key = row['metric'], row['region'], row['originYear']
        feature = features[key]
        assert row['status'] == feature['status'], key
        for field in ['currentTotal', 'previousTotal', 'growthPct']:
            if feature[field] is None:
                assert row[field] is None
            else:
                close(row[field], feature[field], ('feature', key, field))
    expected_keys = {key for key, row in expected.items() if row['targetYear'] >= 2009}
    assert len(evaluation['records']) == len(expected_keys)
    assert {(r['region'], r['horizon'], r['originYear']) for r in evaluation['records']} == expected_keys
    for row in evaluation['records']:
        key = row['region'], row['horizon'], row['originYear']
        other = expected[key]
        assert row['incumbentModel'] == other['incumbentModel'] and row['selected'] == other['selected'], key
        for field in ['baselinePct', 'experimentalPct']:
            close(row[field], other[field], (key, field))
        if other['actualPct'] is not None:
            close(row['actualPct'], other['actualPct'], (key, 'actual'))
        assert set(row['candidatePredictions']) == set(other['candidatePredictions'])
        for name, value in other['candidatePredictions'].items():
            close(row['candidatePredictions'][name], value, (key, name))
        for metric, correction in other['corrections'].items():
            assert (correction is None) == (row['corrections'][metric] is None)
            if correction:
                for field, value in correction.items():
                    close(row['corrections'][metric][field], value, (key, metric, field))
                assert row['corrections'][metric]['trainingMaxTargetYear'] < row['originYear']
        assert set(row['selectionScores']) == set(other['selectionScores'])
        for name, score in other['selectionScores'].items():
            close(row['selectionScores'][name]['mae'], score['mae'], (key, 'selection', name))
            assert row['selectionScores'][name]['count'] == score['count']
            assert row['selectionScores'][name]['maxTargetYear'] == score['maxTargetYear'] < row['originYear']
    for forecast in snapshot['forecasts']:
        other = expected[forecast['region'], forecast['horizon'], snapshot['forecastOriginYear']]
        close(forecast['predictionPct'], other['baselinePct'], ('live point', forecast['region'], forecast['horizon']))
        close(forecast['lowerPct'], other['baselinePct'] - other['radius'], ('live lower', forecast['region'], forecast['horizon']))
        close(forecast['upperPct'], other['baselinePct'] + other['radius'], ('live upper', forecast['region'], forecast['horizon']))
    summaries = []
    def score(rows, field):
        errors = [r[field] - r['actualPct'] for r in rows]
        return {'count': len(rows), 'mae': mean(abs(x) for x in errors), 'rmse': math.sqrt(mean(x * x for x in errors)), 'bias': mean(errors)}
    for published in evaluation['horizons']:
        rows = [r for r in expected.values() if r['horizon'] == published['horizon'] and r['targetYear'] in [2023, 2024, 2025]]
        assert len(rows) == 30 and all(r['actualPct'] is not None for r in rows)
        a, b = score(rows, 'baselinePct'), score(rows, 'experimentalPct')
        gain = 100 * (1 - b['mae'] / a['mae'])
        for name, values in [('baseline', a), ('experiment', b)]:
            for field in ['mae', 'rmse', 'bias']:
                close(published[name][field], values[field], ('holdout', published['horizon'], name, field))
        changed = sum(abs(r['baselinePct'] - r['experimentalPct']) > 1e-10 for r in rows)
        close(published['maeGainPct'], gain, ('holdout gain', published['horizon']))
        assert published['changedCount'] == changed
        years_pass = sum(score([r for r in rows if r['targetYear'] == y], 'experimentalPct')['mae'] <= score([r for r in rows if r['targetYear'] == y], 'baselinePct')['mae'] for y in [2023, 2024, 2025]) >= 2
        province_pass = all(score([r for r in rows if r['region'] == region], 'experimentalPct')['mae'] <= score([r for r in rows if r['region'] == region], 'baselinePct')['mae'] + .25 for region in PROVINCES)
        gates = {'complete': True, 'mae': gain >= 5, 'rmse': b['rmse'] <= a['rmse'], 'years': years_pass, 'provinces': province_pass}
        assert gates == published['gates'] and published['passed'] == all(gates.values())
        summaries.append({'horizon': published['horizon'], 'baseline': a, 'experiment': b, 'maeGainPct': gain, 'changedCount': changed, 'passed': all(gates.values())})
    return {'passed': True, 'dataVersion': snapshot['dataVersion'], 'numericAssertions': numeric, 'sourceFeatureRows': len(features), 'reproducedForecastRows': len(evaluation['records']), 'incumbentForecastsPreserved': len(snapshot['forecasts']), 'sourceHashes': hashes, 'holdout': summaries}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, default=ROOT / 'data/provincial-forecasts.json')
    parser.add_argument('--raw-dir', type=Path, default=ROOT / '.data-cache/monthly-energy')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    report = audit(json.loads(args.snapshot.read_text()), args.raw_dir)
    rendered = json.dumps(report, indent=2) + '\n'
    if args.output:
        args.output.write_text(rendered)
    print(rendered)
