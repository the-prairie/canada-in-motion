"""Frozen, independently reproduced energy-input experiment for provincial GDP.

This module evaluates candidates and records the decision. Numerical production
forecasts stay on the incumbent until a separately reviewed model is admitted.
"""
from datetime import date
import hashlib
import json
import math
from pathlib import Path
from statistics import mean

import refresh_provincial_forecast as incumbent
from refresh_monthly_energy import SPECS, parse_metric, parse_metadata

PROTOCOL = {
    'id': 'monthly-energy-residual-v1', 'frozenOn': '2026-10-20',
    'holdoutTargetYears': [2023, 2024, 2025], 'energyCutoffMonth': 7,
    'energyPublicationLagMonths': 3, 'employmentCutoffMonth': 9,
    'minimumTrainingYears': 5, 'minimumOwnTrainingYears': 5,
    'minimumTrainingProvinces': 4, 'minimumSelectionYears': 3,
    'ridgeRatio': 1, 'maximumRawCorrectionPp': 1, 'correctionWeight': .5,
    'minimumMaeGainPct': 5, 'maximumProvinceMaeLossPp': .25,
    'minimumNonWorseYears': 2, 'electricityBreakYears': [2016],
    'productionPolicy': 'retain-incumbent-until-independent-admission',
    'vintage': 'Revised historical data with simulated publication timing, not real-time vintages.',
    'feature': 'Year-over-year change in January–July production totals. No missing-value imputation.',
    'correction': 'Province-centred pooled ridge of prior incumbent forecast residuals on one energy-growth indicator. Subtract the province residual mean, cap at ±1 percentage point, then apply 50%.',
    'selection': 'Use at least three earlier paired forecast years. Require at least 5% lower MAE and non-worse RMSE than the full incumbent. Choose the lowest-MAE eligible candidate; otherwise retain the incumbent.',
}
CANDIDATES = ['oil-residual', 'gas-residual', 'electricity-residual', 'equal-energy-residual']


def load_energy_history(cache, as_of):
    metrics, sources = [], []
    for metric, spec in SPECS.items():
        table = spec['table']
        raw = (Path(cache) / f'{table}-eng.zip').read_bytes()
        metadata = (Path(cache) / f'{table}-metadata.json').read_bytes()
        receipt = json.loads((Path(cache) / f'{table}-retrieval.json').read_text())
        if receipt['sha256'] != hashlib.sha256(raw).hexdigest() or receipt['metadataSha256'] != hashlib.sha256(metadata).hexdigest():
            raise ValueError('Monthly forecast source differs from retrieval receipt')
        history = parse_metric(raw, metric, retain_months=None)
        meta, released = parse_metadata(metadata, table, history['latestMonth'])
        if released > as_of[:10] or receipt['retrievedAt'][:10] > as_of[:10]:
            raise ValueError('Monthly forecast source is after the as-of date')
        if (date.fromisoformat(as_of[:10]) - date.fromisoformat(receipt['retrievedAt'][:10])).days > 8:
            raise ValueError('Monthly forecast source verification is stale; refresh monthly energy first')
        metrics.append(history)
        sources.append({'id': f'statcan-{table}', 'title': meta['cubeTitleEn'],
                        'url': f'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid={table}01',
                        'sha256': receipt['sha256'], 'metadataSha256': receipt['metadataSha256'],
                        'releaseTime': meta['releaseTime'], 'retrievedAt': receipt['retrievedAt'],
                        'licenceUrl': 'https://www.statcan.gc.ca/en/reference/licence'})
    return {'metrics': metrics, 'sources': sources}


def energy_features(history, last_origin):
    output = {}
    for metric in history['metrics']:
        index = {(r['region'], r['month']): r for r in metric['observations']}
        for region in incumbent.PROVINCES:
            for year in range(int(metric['months'][0][:4]), last_origin + 1):
                months = [f'{year}-{m:02}' for m in range(1, 8)]
                prior_months = [f'{year-1}-{m:02}' for m in range(1, 8)]
                current = [index.get((region, month)) for month in months]
                previous = [index.get((region, month)) for month in prior_months]
                available = all(r is not None and r['status'] == 'available' for r in current + previous)
                current_total = sum(r['value'] for r in current) if all(r and r['status'] == 'available' for r in current) else None
                previous_total = sum(r['value'] for r in previous) if all(r and r['status'] == 'available' for r in previous) else None
                reason = None if available else 'incomplete-source-months'
                if metric['id'] == 'electricity' and year in PROTOCOL['electricityBreakYears']:
                    reason = 'source-coverage-break'
                if available and previous_total <= 0:
                    reason = 'zero-prior-total'
                output[metric['id'], region, year] = {
                    'metric': metric['id'], 'region': region, 'originYear': year,
                    'through': months[-1], 'sourceId': metric['sourceId'], 'unit': metric['unit'],
                    'currentTotal': current_total, 'previousTotal': previous_total,
                    'growthPct': 100 * (current_total / previous_total - 1) if reason is None else None,
                    'status': 'available' if reason is None else reason,
                }
    return output


def replay_incumbent(snapshot):
    source = {'gdp': snapshot['history']['gdp'], 'employment': snapshot['history']['employment']}
    gdp, features, rows = incumbent.prepare_inputs(source, PROTOCOL['employmentCutoffMonth'])
    records = []
    for region in incumbent.PROVINCES:
        for horizon in [0, 1]:
            earlier = []
            for origin in sorted(y for r, y in features if r == region and y <= snapshot['forecastOriginYear']):
                fitted = incumbent.candidate_forecasts(rows[horizon], region, origin, features[region, origin])
                if fitted is None:
                    continue
                visible = [r for r in earlier if r['targetYear'] < origin]
                selected, _ = incumbent.select_model(visible)
                record = {'region': region, 'horizon': horizon, 'originYear': origin,
                          'targetYear': origin + horizon, 'baselinePct': fitted[selected]['predictionPct'],
                          'benchmarkPct': fitted['historical-mean']['predictionPct'],
                          'incumbentModel': selected, 'candidates': {k: v['predictionPct'] for k, v in fitted.items()}}
                actual, previous = gdp.get((region, origin + horizon)), gdp.get((region, origin + horizon - 1))
                if actual is not None and previous is not None:
                    record['actualPct'] = incumbent.growth(actual, previous)
                    earlier.append(record)
                records.append(record)
    return [{k: v for k, v in row.items() if k != 'candidates'} for row in records]


def correction(metric, region, horizon, origin, records, features):
    current = features.get((metric, region, origin))
    if not current or current['status'] != 'available':
        return None
    train = []
    for record in records:
        feature = features.get((metric, record['region'], record['originYear']))
        if record['horizon'] == horizon and record['targetYear'] < origin and 'actualPct' in record and feature and feature['status'] == 'available':
            train.append({'region': record['region'], 'targetYear': record['targetYear'],
                          'y': record['actualPct'] - record['baselinePct'], 'features': {'energyGrowth': feature['growthPct']}})
    eligible = {r for r in incumbent.PROVINCES if len({x['targetYear'] for x in train if x['region'] == r}) >= PROTOCOL['minimumOwnTrainingYears']}
    train = [r for r in train if r['region'] in eligible]
    own = [r for r in train if r['region'] == region]
    if region not in eligible or len(eligible) < PROTOCOL['minimumTrainingProvinces'] or len({r['targetYear'] for r in train}) < PROTOCOL['minimumTrainingYears']:
        return None
    fit = incumbent.ridge(train, region, ['energyGrowth'])
    centred = incumbent.predict_fit(fit, {'energyGrowth': current['growthPct']}) - mean(r['y'] for r in own)
    delta = PROTOCOL['correctionWeight'] * max(-PROTOCOL['maximumRawCorrectionPp'], min(PROTOCOL['maximumRawCorrectionPp'], centred))
    return {'deltaPp': delta, 'inputGrowthPct': current['growthPct'], 'coefficient': fit['coefficients']['energyGrowth'],
            'trainingRows': len(train), 'ownRows': len(own), 'trainingYears': len({r['targetYear'] for r in train}),
            'trainingProvinces': len(eligible), 'trainingMaxTargetYear': max(r['targetYear'] for r in train)}


def score(rows, field):
    errors = [r[field] - r['actualPct'] for r in rows]
    if not errors:
        return None
    return {'count': len(errors), 'mae': mean(abs(e) for e in errors),
            'rmse': math.sqrt(mean(e * e for e in errors)), 'bias': mean(errors)}


def pair_scores(rows):
    baseline, experiment = score(rows, 'baselinePct'), score(rows, 'experimentalPct')
    return {'baseline': baseline, 'experiment': experiment,
            'maeGainPct': 100 * (1 - experiment['mae'] / baseline['mae']) if baseline and baseline['mae'] else None,
            'changedCount': sum(abs(r['baselinePct'] - r['experimentalPct']) > 1e-10 for r in rows)}


def evaluate_energy(snapshot, history):
    if incumbent.RIDGE_RATIO != PROTOCOL['ridgeRatio']:
        raise ValueError('Incumbent ridge setting differs from the frozen energy protocol')
    if snapshot['information']['employmentCutoffMonth'] != 9:
        return {'schemaVersion': 1, 'status': 'outside-tested-cutoff', 'protocol': PROTOCOL, 'sources': history['sources'],
                'reason': 'This frozen experiment requires January–September employment and January–July energy. The incumbent forecast is unchanged.'}
    origin_year = snapshot['forecastOriginYear']
    if date.fromisoformat(snapshot['asOf'][:10]) < date(origin_year, 10, 1):
        return {'schemaVersion': 1, 'status': 'outside-tested-cutoff', 'protocol': PROTOCOL, 'sources': history['sources'],
                'reason': 'The frozen July energy experiment is eligible from October. The incumbent forecast is unchanged.'}
    features = energy_features(history, origin_year)
    baseline = replay_incumbent(snapshot)
    records = []
    for row in baseline:
        if row['targetYear'] < 2009:
            continue
        corrections = {metric: correction(metric, row['region'], row['horizon'], row['originYear'], baseline, features) for metric in SPECS}
        predictions = {f'{metric}-residual': row['baselinePct'] + c['deltaPp'] for metric, c in corrections.items() if c is not None}
        if predictions:
            predictions['equal-energy-residual'] = mean(predictions.values())
        records.append({**row, 'corrections': corrections, 'candidatePredictions': predictions})
    for row in records:
        scores = {}
        for candidate in CANDIDATES:
            if candidate not in row['candidatePredictions']:
                continue
            prior = [r for r in records if r['region'] == row['region'] and r['horizon'] == row['horizon'] and r['targetYear'] < row['originYear'] and 'actualPct' in r and candidate in r['candidatePredictions']]
            if len(prior) < PROTOCOL['minimumSelectionYears']:
                continue
            errors = [r['candidatePredictions'][candidate] - r['actualPct'] for r in prior]
            baseline_errors = [r['baselinePct'] - r['actualPct'] for r in prior]
            mae, baseline_mae = mean(abs(e) for e in errors), mean(abs(e) for e in baseline_errors)
            if mae <= .95 * baseline_mae and mean(e * e for e in errors) <= mean(e * e for e in baseline_errors):
                scores[candidate] = {'mae': mae, 'count': len(prior), 'maxTargetYear': max(r['targetYear'] for r in prior)}
        selected = min(scores, key=lambda c: scores[c]['mae']) if scores else 'incumbent'
        row.update({'selected': selected, 'selectionScores': scores, 'experimentalPct': row['baselinePct'] if selected == 'incumbent' else row['candidatePredictions'][selected]})
    horizons = []
    for horizon in [0, 1]:
        heldout = [r for r in records if r['horizon'] == horizon and r['targetYear'] in PROTOCOL['holdoutTargetYears'] and 'actualPct' in r]
        by_year = [{'year': year, **pair_scores([r for r in heldout if r['targetYear'] == year])} for year in PROTOCOL['holdoutTargetYears']]
        by_province = [{'region': region, **pair_scores([r for r in heldout if r['region'] == region])} for region in incumbent.PROVINCES]
        aggregate = pair_scores(heldout)
        complete = len(heldout) == 30 and all(p['baseline'] and p['baseline']['count'] == 3 for p in by_province)
        gates = {'complete': complete,
                 'mae': complete and aggregate['maeGainPct'] >= PROTOCOL['minimumMaeGainPct'],
                 'rmse': complete and aggregate['experiment']['rmse'] <= aggregate['baseline']['rmse'],
                 'years': complete and sum(y['experiment']['mae'] <= y['baseline']['mae'] for y in by_year) >= PROTOCOL['minimumNonWorseYears'],
                 'provinces': complete and all(p['experiment']['mae'] <= p['baseline']['mae'] + PROTOCOL['maximumProvinceMaeLossPp'] for p in by_province)}
        horizons.append({'horizon': horizon, **aggregate, 'byYear': by_year, 'byProvince': by_province,
                         'gates': gates, 'passed': all(gates.values()),
                         'eligibleOnly': pair_scores([r for r in heldout if r['candidatePredictions']]),
                         'periods': [{'label': label, **pair_scores([r for r in records if r['horizon'] == horizon and 'actualPct' in r and r['targetYear'] in years])} for label, years in [('development', range(2015, 2023)), ('pandemic', [2020]), ('without-pandemic', [y for y in range(2015, 2026) if y not in [2020, 2021]])]]})
    current = [r for r in records if r['originYear'] == origin_year]
    for row in current:
        production = next(r for r in snapshot['forecasts'] if r['region'] == row['region'] and r['horizon'] == row['horizon'])
        if abs(row['baselinePct'] - production['predictionPct']) > 1e-10:
            raise ValueError('Energy experiment failed to reproduce the incumbent forecast')
    return {'schemaVersion': 1, 'status': 'evaluated', 'protocol': PROTOCOL, 'sources': history['sources'],
            'energyThrough': f'{origin_year}-07', 'horizons': horizons, 'records': records,
            'features': list(features.values()), 'adopted': False,
            'decision': 'The existing GDP forecasts are retained. Candidates require all release checks and independent admission; passing a numeric check alone cannot silently change the model.'}


def attach_energy_evaluation(snapshot, history):
    result = evaluate_energy(snapshot, history)
    snapshot['energyEvaluation'] = result
    snapshot['dataVersion'] = hashlib.sha256(json.dumps({k: v for k, v in snapshot.items() if k != 'dataVersion'}, sort_keys=True, separators=(',', ':')).encode()).hexdigest()[:20]
    return snapshot
