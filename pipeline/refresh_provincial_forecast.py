#!/usr/bin/env python3
"""Reproducible, publication-lag-aware forecasts of provincial real GDP growth.

Prediction only: no coefficient is offered as a causal energy-price response.
Every historical forecast refits from data whose annual target is observable at
that origin. Hyperparameter selection and empirical ranges use earlier forecasts.
"""
import argparse
from datetime import date, datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[1]
REGIONS = {'NL': 'Newfoundland and Labrador', 'PE': 'Prince Edward Island', 'NS': 'Nova Scotia',
           'NB': 'New Brunswick', 'QC': 'Quebec', 'ON': 'Ontario', 'MB': 'Manitoba',
           'SK': 'Saskatchewan', 'AB': 'Alberta', 'BC': 'British Columbia',
           'YT': 'Yukon', 'NT': 'Northwest Territories', 'NU': 'Nunavut'}
PROVINCES = list(REGIONS)[:10]
CANDIDATES = ['historical-mean', 'shrunk-autoregression', 'employment-bridge', 'pooled-employment-bridge']
MINIMUM_TRAINING = 10
MINIMUM_SELECTION = 5
MINIMUM_CALIBRATION = 5
VALIDATION_START = 2015
RANGE_TARGET = 0.8
RIDGE_RATIO = 1.0
LITERATURE = [
    {'title': 'A Three-Frequency Dynamic Factor Model for Nowcasting Canadian Provincial GDP Growth',
     'authors': 'Chernis, Velasco and Cheung (2017)', 'url': 'https://www.bankofcanada.ca/2017/06/staff-discussion-paper-2017-8/',
     'application': 'Timely provincial indicators and explicit data-release timing; this implementation is a small bridge model, not a replication of the full dynamic-factor model.'},
    {'title': 'Nowcasting Canadian GDP with Density Combinations', 'authors': 'Chernis and Webley (2022)',
     'url': 'https://www.bankofcanada.ca/2022/05/staff-discussion-paper-2022-12/',
     'application': 'Separate prediction accuracy from uncertainty calibration and distinguish revised-data exercises from actual real-time performance.'},
    {'title': 'The Accuracy of Short-Term Forecast Combinations', 'authors': 'Granziera, Luu and St-Amant (2013)',
     'url': 'https://www.bankofcanada.ca/wp-content/uploads/2013/08/boc-review-summer13-granziera.pdf',
     'application': 'Compare multiple model classes with simple benchmarks using only earlier predictive performance.'},
]


def mean(values):
    return statistics.mean(values)


def growth(current, previous):
    if not all(isinstance(x, (int, float)) and math.isfinite(x) and x > 0 for x in [current, previous]):
        raise ValueError('Growth requires finite positive levels')
    return 100 * (current / previous - 1)


def solve(matrix, vector):
    """Pivoted linear solve for the small ridge system."""
    n = len(vector)
    a = [list(row) + [vector[i]] for i, row in enumerate(matrix)]
    for c in range(n):
        pivot = max(range(c, n), key=lambda r: abs(a[r][c]))
        if abs(a[pivot][c]) < 1e-12:
            raise ValueError('Singular regression system')
        a[c], a[pivot] = a[pivot], a[c]
        divisor = a[c][c]
        a[c] = [v / divisor for v in a[c]]
        for r in range(n):
            if r != c:
                factor = a[r][c]
                a[r] = [v - factor * w for v, w in zip(a[r], a[c])]
    return [r[-1] for r in a]


def ridge(rows, region, features):
    """Province intercepts with a shared ridge slope when rows span provinces.

    Center within province before fitting slopes. Scale using training rows only.
    Fixed penalty n * 1.0 is chosen in advance, not by the evaluation sample.
    """
    grouped = {}
    for row in rows:
        grouped.setdefault(row['region'], []).append(row)
    centres = {r: {'y': mean(x['y'] for x in values),
                   'x': [mean(x['features'][f] for x in values) for f in features]}
               for r, values in grouped.items()}
    if region not in centres:
        raise ValueError('Forecast province missing from training sample')
    x = [[row['features'][f] - centres[row['region']]['x'][i] for i, f in enumerate(features)] for row in rows]
    y = [row['y'] - centres[row['region']]['y'] for row in rows]
    scale = [math.sqrt(mean(row[i] ** 2 for row in x)) or 1 for i in range(len(features))]
    z = [[v / scale[i] for i, v in enumerate(row)] for row in x]
    penalty = len(rows) * RIDGE_RATIO
    beta = solve([[sum(row[i] * row[j] for row in z) + (penalty if i == j else 0) for j in range(len(features))] for i in range(len(features))],
                 [sum(row[i] * target for row, target in zip(z, y)) for i in range(len(features))])
    slopes = [b / scale[i] for i, b in enumerate(beta)]
    intercept = centres[region]['y'] - sum(slope * centre for slope, centre in zip(slopes, centres[region]['x']))
    return {'intercept': intercept, 'coefficients': dict(zip(features, slopes)), 'standardizedCoefficients': beta,
            'trainingScales': dict(zip(features, scale)), 'trainingRows': len(rows),
            'provinceTrainingRows': len(grouped[region]), 'ridgePenalty': penalty, 'ridgeRatio': RIDGE_RATIO,
            'trainingMaxTargetYear': max(row['targetYear'] for row in rows)}


def predict_fit(model, features):
    value = model['intercept'] + sum(value * features[key] for key, value in model['coefficients'].items())
    if not math.isfinite(value):
        raise ValueError('Non-finite forecast')
    return value


def prepare_inputs(source_data, cutoff_month):
    gdp = {(x['region'], x['year']): x['value'] for x in source_data['gdp'] if x['status'] == 'available'}
    employment = {(x['region'], x['month']): x['value'] for x in source_data['employment'] if x['status'] == 'available'}
    features = {}
    years = sorted({int(month[:4]) for _, month in employment})
    for region in PROVINCES:
        for year in years:
            if any((region, y) not in gdp for y in [year - 2, year - 1]):
                continue
            current = [employment.get((region, f'{year}-{month:02}')) for month in range(1, cutoff_month + 1)]
            previous = [employment.get((region, f'{year-1}-{month:02}')) for month in range(1, cutoff_month + 1)]
            if any(value is None for value in current + previous):
                continue
            features[region, year] = {'lagGrowthPct': growth(gdp[region, year - 1], gdp[region, year - 2]),
                                     'employmentGrowthPct': growth(sum(current), sum(previous)),
                                     'employmentCurrentMean': mean(current), 'employmentPreviousMean': mean(previous)}
    rows = {h: [] for h in [0, 1]}
    for (region, origin), values in features.items():
        for h in rows:
            target = origin + h
            if (region, target) in gdp and (region, target - 1) in gdp:
                rows[h].append({'region': region, 'originYear': origin, 'targetYear': target,
                                'features': values, 'y': growth(gdp[region, target], gdp[region, target-1])})
    return gdp, features, rows


def candidate_forecasts(rows, region, origin_year, features):
    # The annual prior-year GDP is published in the spring. At a September/October
    # origin it is available, while current-year annual GDP is not.
    train = [row for row in rows if row['targetYear'] < origin_year]
    own = [row for row in train if row['region'] == region]
    if len(own) < MINIMUM_TRAINING:
        return None
    history_mean = mean(row['y'] for row in own)
    models = {'historical-mean': {'intercept': history_mean, 'coefficients': {}, 'trainingRows': len(own),
                                'provinceTrainingRows': len(own), 'trainingMaxTargetYear': max(row['targetYear'] for row in own)}}
    models['shrunk-autoregression'] = ridge(own, region, ['lagGrowthPct'])
    models['employment-bridge'] = ridge(own, region, ['lagGrowthPct', 'employmentGrowthPct'])
    models['pooled-employment-bridge'] = ridge(train, region, ['lagGrowthPct', 'employmentGrowthPct'])
    return {name: {'predictionPct': predict_fit(model, features), 'fit': model} for name, model in models.items()}


def select_model(prior):
    """Select using earlier, already-observed candidate forecasts only.

    A richer model must improve prior MAE by at least 5%. Otherwise use the
    historical mean. This same rule is rerun at every historical origin.
    """
    if len(prior) < MINIMUM_SELECTION:
        return 'historical-mean', {}
    scores = {name: mean(abs(row['candidates'][name] - row['actualPct']) for row in prior) for name in CANDIDATES}
    best = min(CANDIDATES, key=lambda name: scores[name])
    return (best if scores[best] < .95 * scores['historical-mean'] else 'historical-mean'), scores


def interval_radius(prior):
    if len(prior) < MINIMUM_CALIBRATION:
        return None
    errors = sorted(abs(row['predictionPct'] - row['actualPct']) for row in prior)
    rank = min(len(errors), math.ceil((len(errors) + 1) * RANGE_TARGET))
    return errors[rank - 1]


def wilson(successes, total):
    if not total:
        return None
    z = 1.959963984540054
    p = successes / total
    denom = 1 + z * z / total
    center = (p + z * z / (2 * total)) / denom
    half = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denom
    return [max(0, center - half), min(1, center + half)]


def summarize_validation(records):
    tests = [row for row in records if row['targetYear'] >= VALIDATION_START]
    if not tests:
        raise ValueError('No evaluation forecasts')
    intervals = [row for row in tests if row['lowerPct'] is not None]
    covered = sum(row['lowerPct'] <= row['actualPct'] <= row['upperPct'] for row in intervals)
    mae = mean(abs(row['predictionPct'] - row['actualPct']) for row in tests)
    benchmark_mae = mean(abs(row['benchmarkPct'] - row['actualPct']) for row in tests)
    return {'count': len(tests), 'mae': mae, 'benchmarkMae': benchmark_mae,
            'rmse': math.sqrt(mean((row['predictionPct'] - row['actualPct']) ** 2 for row in tests)),
            'improvementPct': 100 * (1 - mae / benchmark_mae) if benchmark_mae else None,
            'intervalCoverage': covered / len(intervals) if intervals else None,
            'intervalCount': len(intervals), 'intervalCoverageWilson95': wilson(covered, len(intervals)),
            'firstTargetYear': min(row['targetYear'] for row in tests), 'lastTargetYear': max(row['targetYear'] for row in tests),
            'heldout': tests}


def build(source_data, as_of=None):
    as_of = as_of or date.today().isoformat()
    as_of_date = date.fromisoformat(as_of[:10])
    available_gdp = [row for row in source_data['gdp'] if row['status'] == 'available' and row['region'] in PROVINCES]
    gdp_year = min(max(row['year'] for row in available_gdp if row['region'] == region) for region in PROVINCES)
    origin_year = gdp_year + 1
    if origin_year > as_of_date.year:
        raise ValueError('GDP source includes a future reference year')
    employment_months = [row['month'] for row in source_data['employment'] if row['status'] == 'available' and row['region'] in PROVINCES and row['month'].startswith(f'{origin_year}-')]
    if not employment_months:
        raise ValueError('No current-year employment observations for forecast origin')
    # Use the latest common month, at most September, consistently in every fold.
    last_by_region = [max(row['month'] for row in source_data['employment'] if row['status'] == 'available' and row['region'] == region and row['month'].startswith(f'{origin_year}-')) for region in PROVINCES]
    cutoff_month = min(9, int(min(last_by_region)[5:7]))
    if date(origin_year, cutoff_month, 1) > as_of_date:
        raise ValueError('Employment predictor is from the future')
    gdp, features, rows = prepare_inputs(source_data, cutoff_month)
    forecasts = []
    for region in PROVINCES:
        if (region, origin_year) not in features:
            raise ValueError(f'Incomplete current predictors: {region}')
        for horizon in [0, 1]:
            records = []
            possible = sorted(row for r, row in features if r == region and row <= origin_year)
            for origin in possible:
                fitted = candidate_forecasts(rows[horizon], region, origin, features[region, origin])
                if fitted is None:
                    continue
                prior = [row for row in records if row['targetYear'] < origin]
                selected, scores = select_model(prior)
                prediction = fitted[selected]['predictionPct']
                radius = interval_radius(prior)
                record = {'originYear': origin, 'targetYear': origin + horizon,
                          'predictionPct': prediction, 'benchmarkPct': fitted['historical-mean']['predictionPct'],
                          'lowerPct': prediction - radius if radius is not None else None,
                          'upperPct': prediction + radius if radius is not None else None,
                          'model': selected, 'candidates': {name: x['predictionPct'] for name, x in fitted.items()},
                          'trainingMaxTargetYear': fitted[selected]['fit']['trainingMaxTargetYear'],
                          'trainingRows': fitted[selected]['fit']['provinceTrainingRows'],
                          'calibrationMaxTargetYear': max((row['targetYear'] for row in prior), default=None),
                          'calibrationCount': len(prior), 'selectionScores': scores,
                          'selectionMaxTargetYear': max((row['targetYear'] for row in prior), default=None)}
                actual = gdp.get((region, origin + horizon))
                previous = gdp.get((region, origin + horizon - 1))
                if origin < origin_year:
                    if actual is not None and previous is not None:
                        record['actualPct'] = growth(actual, previous)
                        records.append(record)
                else:
                    validation = summarize_validation(records)
                    forecasts.append({'region': region, 'year': origin + horizon, 'horizon': horizon,
                                      'predictionPct': prediction, 'lowerPct': record['lowerPct'], 'upperPct': record['upperPct'],
                                      'model': selected, 'benchmarkPct': record['benchmarkPct'],
                                      'inputs': {'originYear': origin, 'lagGDPYear': origin - 1,
                                                 'employmentThrough': f'{origin}-{cutoff_month:02}', **features[region, origin]},
                                      'modelDetails': {'candidates': fitted, 'selectionScores': scores,
                                                       'selectionMaxTargetYear': record['selectionMaxTargetYear'],
                                                       'calibrationCount': len(prior), 'calibrationMaxTargetYear': record['calibrationMaxTargetYear'],
                                                       'historicalErrorRadiusPctPoints': radius},
                                      'validation': validation})
    if len(forecasts) != 20:
        raise ValueError('Expected two forecasts for each of ten provinces')
    result = {'schemaVersion': 1, 'method': 'publication-lag-aware-provincial-gdp-forecast',
              'asOf': as_of_date.isoformat(), 'forecastOriginYear': origin_year,
              'information': {'gdpYear': gdp_year, 'employmentThrough': f'{origin_year}-{cutoff_month:02}',
                              'employmentCutoffMonth': cutoff_month, 'originLagYears': as_of_date.year - origin_year, 'gdpBasis': 'GDP at basic prices',
                              'gdpUnit': 'million chained 2017 CAD', 'forecastUnit': 'annual real GDP growth (%)'},
              'sources': source_data['sources'],
              'history': {'gdp': source_data['gdp'], 'employment': source_data['employment']},
              'regions': [{'code': code, 'name': name, 'status': 'available' if code in PROVINCES else 'insufficient-indicator-coverage'} for code, name in REGIONS.items()],
              'forecasts': forecasts,
              'methodology': {'predictionRangeTarget': RANGE_TARGET, 'validationStartYear': VALIDATION_START,
                              'minimumTrainingRows': MINIMUM_TRAINING, 'minimumSelectionForecasts': MINIMUM_SELECTION,
                              'minimumCalibrationForecasts': MINIMUM_CALIBRATION, 'ridgeRatio': RIDGE_RATIO,
                              'candidates': CANDIDATES,
                              'selection': 'At each origin, use the candidate with lowest MAE on earlier forecasts whose annual outcomes were already available. A richer candidate needs at least five such forecasts and at least 5% lower MAE than the historical mean; otherwise use the historical mean.',
                              'range': 'Symmetric range from the finite-sample-adjusted 80th percentile of earlier absolute forecast errors. Historical coverage is measured separately; temporal dependence and data revisions prevent a guaranteed 80% probability interpretation.',
                              'coverageInterval': 'The Wilson interval is a descriptive small-sample binomial summary of observed coverage. Annual errors may be dependent, so it is not a validated interval for future coverage.',
                              'availability': 'Latest annual prior-year GDP is available by the spring; employment uses January through the displayed cutoff month. Historical folds use that same month cutoff. No training, selection or calibration outcome reaches the forecast-origin year.',
                              'limitations': [
                                  'These are model forecasts of real output, not causal estimates of an oil, gas or electricity price change.',
                                  'Backtests use today’s revised historical data with simulated release timing, not the original published data vintages.',
                                  'A short annual record gives limited evidence about forecast accuracy, especially during recessions, pandemics or structural change.',
                                  'Prediction ranges describe earlier forecast errors. They do not guarantee future coverage and may miss new shocks.',
                                  'Historical performance is reported for the complete selection procedure, including its simple-model fallback.',
                                  'Employment has incomplete comparable monthly coverage in the territories, so no territorial GDP forecast is inferred.',
                                  'Chained provincial GDP levels are not additive and these forecasts are not reconciled into a Canada total.',
                                  'The next-year forecast uses current-year indicators; it does not know next-year employment, policies or commodity prices.'
                              ], 'literature': LITERATURE}}
    result['dataVersion'] = hashlib.sha256(json.dumps(result, sort_keys=True, separators=(',', ':')).encode()).hexdigest()[:20]
    return result


def main():
    from provincial_forecast_sources import load_sources
    parser = argparse.ArgumentParser()
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--as-of', default=date.today().isoformat())
    parser.add_argument('--cache', type=Path, default=ROOT / '.data-cache' / 'provincial-forecast')
    parser.add_argument('--output', type=Path, default=ROOT / 'data' / 'provincial-forecasts.json')
    args = parser.parse_args()
    data = build(load_sources(args.cache, offline=args.offline, as_of=args.as_of), args.as_of)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    temporary.replace(args.output)
    print(json.dumps({'dataVersion': data['dataVersion'], 'originYear': data['forecastOriginYear'], 'forecasts': len(data['forecasts']),
                      'employmentThrough': data['information']['employmentThrough'],
                      'backtests': sum(row['validation']['count'] for row in data['forecasts'])}))


if __name__ == '__main__':
    main()
