from pathlib import Path
import hashlib
import json
import math
import subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
FILES = ['energy-flows', 'provincial-impacts', 'provincial-price-response', 'household-energy-costs']
DATA = {name: json.loads((ROOT / 'data' / f'{name}.json').read_text()) for name in FILES}
CHECKS = 0
MAX_DIFFERENCE = 0
COUNTS = {'gdpModels': 0, 'gdpHistoricalPredictions': 0, 'householdMonthlyPredictions': 0, 'householdAnnualPredictions': 0, 'spendingReferences': 0}


def close(actual, expected, label, tolerance=1e-8):
    global CHECKS, MAX_DIFFERENCE
    CHECKS += 1
    difference = abs(actual - expected)
    MAX_DIFFERENCE = max(MAX_DIFFERENCE, difference)
    assert math.isfinite(difference) and difference <= tolerance, (label, actual, expected)


def equal(actual, expected, label):
    global CHECKS
    CHECKS += 1
    assert actual == expected, (label, actual, expected)


def regression(rows, region, columns, pooled=False):
    regions = sorted({r['region'] for r in rows}) if pooled else [region]
    x = np.asarray([[float(r['region'] == p) for p in regions] + [r[c] for c in columns] for r in rows])
    beta = np.linalg.lstsq(x, np.asarray([r['y'] for r in rows]), rcond=None)[0]
    return np.asarray([beta[regions.index(region)], *beta[len(regions):]])


def candidates(own, peers, region, columns):
    own_fit = regression(own, region, columns)
    if region in ['YT', 'NT', 'NU']:
        return {'own': own_fit}
    pooled = regression(peers, region, columns, True)
    return {'own': own_fit, 'half-pool': (own_fit + pooled) / 2, 'pool': pooled}


def choose(prior, key):
    return 'own' if len(prior) < 5 else min(prior[0][key], key=lambda k: np.mean([abs(r[key][k] - r['actualPct']) for r in prior]))


def gdp_rows(region, commodity, horizon):
    history = DATA['provincial-price-response']['history']
    gdp = {r['year']: r['value'] for r in history['gdp'] if r['region'] == region and r['status'] == 'available'}
    prices = {r['year']: r['value'] for r in history['prices'] if r['commodity'] == commodity}
    return [{'year': y, 'region': region, 'end': y + horizon, 'y': 100 * math.log(gdp[y + horizon] / gdp[y - 1]),
             'lag': 100 * math.log(gdp[y - 1] / gdp[y - 2]), 'price': 100 * math.log(prices[y] / prices[y - 1])}
            for y in sorted(prices) if y - 1 in prices and all(k in gdp for k in [y - 2, y - 1, y + horizon])]


def gdp_audit():
    models = DATA['provincial-price-response']['models']
    for model in models:
        region, commodity, horizon = (model[k] for k in ['region', 'commodity', 'horizonYears'])
        own = gdp_rows(region, commodity, horizon)
        peers = [row for peer in model['fit']['peerRegions'] for row in gdp_rows(peer, commodity, horizon)]
        prior = []
        for heldout in model['heldout']:
            y = heldout['year']
            row = next(r for r in own if r['year'] == y)
            train = [r for r in own if r['end'] < y]
            pooled = [r for r in peers if r['end'] < y]
            eligible = [r for r in prior if r['outcomeYear'] < y]
            price_fits = candidates(train, pooled, region, ['lag', 'price'])
            base_fits = candidates(train, pooled, region, ['lag'])
            price_predictions = {k: 100 * math.expm1(float(b @ [1, row['lag'], row['price']]) / 100) for k, b in price_fits.items()}
            base_predictions = {k: 100 * math.expm1(float(b @ [1, row['lag']]) / 100) for k, b in base_fits.items()}
            selected, baseline = choose(eligible, 'candidatePredictions'), choose(eligible, 'baselineCandidates')
            actual = 100 * math.expm1(row['y'] / 100)
            for field, expected in [('actualPct', actual), ('modelPct', price_predictions[selected]), ('baselineArPct', base_predictions[baseline]),
                                    ('baselineMeanPct', 100 * math.expm1(float(np.mean([r['y'] for r in train])) / 100)),
                                    ('coefficient', float(price_fits[selected][-1]))]:
                close(heldout[field], expected, f'{region}/{commodity}/{horizon}/{y}/{field}')
            equal(heldout['variant'], selected, 'earlier-only price-model selection')
            equal(heldout['baselineVariant'], baseline, 'earlier-only baseline selection')
            equal(heldout['trainingEnd'], max(r['end'] for r in pooled), 'GDP outcome boundary')
            equal(heldout['latestSelectionOutcomeYear'], max((r['outcomeYear'] for r in eligible), default=None), 'GDP selection outcome boundary')
            for variant in price_predictions:
                close(heldout['candidatePredictions'][variant], price_predictions[variant], 'candidate GDP prediction')
                close(heldout['baselineCandidates'][variant], base_predictions[variant], 'candidate GDP baseline')
            prior.append({**heldout, 'actualPct': actual, 'candidatePredictions': price_predictions, 'baselineCandidates': base_predictions})
            COUNTS['gdpHistoricalPredictions'] += 1
        selected = choose(prior, 'candidatePredictions')
        coefficient = float(candidates(own, peers, region, ['lag', 'price'])[selected][-1])
        close(model['coefficient'], coefficient, 'final GDP coefficient')
        equal(model['fit']['variant'], selected, 'final GDP selection')
        scores = {}
        for name, rows in [('all', prior), ('recent', [r for r in prior if r['year'] >= 2015]),
                           ('nonPandemic', [r for r in prior if not any(y in [2020, 2021] for y in range(r['year'], r['outcomeYear'] + 1))])]:
            errors = {field: np.asarray([r[field] - r['actualPct'] for r in rows]) for field in ['modelPct', 'baselineArPct', 'baselineMeanPct']}
            maes = {field: float(np.mean(abs(error))) for field, error in errors.items()}
            scores[name] = {'mae': maes['modelPct'], 'improvement': 100 * (1 - maes['modelPct'] / min(maes['baselineArPct'], maes['baselineMeanPct'])),
                            'rmse': math.sqrt(float(np.mean(errors['modelPct'] ** 2))),
                            'baselineRmse': min(math.sqrt(float(np.mean(errors[key] ** 2))) for key in ['baselineArPct', 'baselineMeanPct'])}
        v = model['validation']
        close(v['maePctPoints'], scores['all']['mae'], 'GDP historical MAE')
        close(v['improvementPct'], scores['all']['improvement'], 'GDP baseline gain')
        stable = np.mean([math.copysign(1, r['coefficient']) == math.copysign(1, coefficient) for r in prior])
        criteria = {'heldoutMinimum': len(prior) >= 12, 'maeImprovement': scores['all']['improvement'] >= 5,
                    'rmseNoWorse': scores['all']['rmse'] <= scores['all']['baselineRmse'], 'nonPandemicGain': scores['nonPandemic']['improvement'] > 0,
                    'recentGain': scores['recent']['improvement'] >= 0, 'stableSign': stable >= .8}
        equal(v['criteria'], criteria, 'GDP admission criteria')
        equal(v['passesScreen'], all(criteria.values()), 'GDP admission decision')
        COUNTS['gdpModels'] += 1


def household_rows(region, commodity, lags):
    observations = DATA['household-energy-costs']['observations']
    cpi = {r['month']: r['value'] for r in observations['cpi'] if r['region'] == region and r['commodity'] == commodity and r['value'] and r['status'] not in ['F', 'x']}
    benchmark = observations['benchmarks'][commodity]
    dates = sorted(cpi.keys() & benchmark.keys())
    result = []
    month_number = lambda s: int(s[:4]) * 12 + int(s[5:])
    for i in range(lags + 2, len(dates)):
        window = dates[i - lags - 2:i + 1]
        if any(month_number(b) - month_number(a) != 1 for a, b in zip(window, window[1:])):
            continue
        m = dates[i]
        base = [1, 100 * math.log(cpi[dates[i-1]] / cpi[dates[i-2]])] + [float(int(m[5:]) == j) for j in range(2, 13)]
        changes = [100 * math.log(benchmark[dates[i-j]]['cad'] / benchmark[dates[i-j-1]]['cad']) for j in range(lags + 1)]
        result.append({'month': m, 'x': base + changes, 'base': base, 'y': 100 * math.log(cpi[m] / cpi[dates[i-1]]), 'level': cpi[m], 'previous': cpi[dates[i-1]]})
    return result


def household_audit():
    d = DATA['household-energy-costs']
    for baseline in d['spendingBaselines']:
        obs = [r for r in d['observations']['cpi'] if r['region'] == baseline['region'] and r['commodity'] == baseline['commodity'] and r['value'] is not None]
        obs.sort(key=lambda r: r['month'])
        reference = [r['value'] for r in obs if int(r['month'][:4]) == baseline['spendingYear']]
        spend = next(r for r in d['observations']['spending'] if (r['region'], r['commodity'], r['year']) == (baseline['region'], baseline['commodity'], baseline['spendingYear']))
        equal(baseline['annualCad'], spend['value'], 'survey spending reference')
        if baseline['status'] == 'available':
            close(baseline['currentAnnualCad'], spend['value'] * float(np.mean([r['value'] for r in obs[-12:]])) / float(np.mean(reference)), 'CPI repriced expenditure')
        else:
            equal(baseline['currentAnnualCad'], None, 'unavailable spending reference')
        COUNTS['spendingReferences'] += 1
    for model in d['calibrations']:
        if model['status'] == 'unavailable':
            continue
        rows = household_rows(model['region'], model['commodity'], model['lagMonths'])
        x = np.asarray([r['x'] for r in rows]); y = np.asarray([r['y'] for r in rows]); base = x[:, :13]
        beta = np.linalg.lstsq(x, y, rcond=None)[0]
        close(model['coefficients']['autoregressive'], float(beta[1]), 'household final AR coefficient')
        for a, b in zip(model['coefficients']['benchmarkLags'], beta[13:]):
            close(a, float(b), 'household benchmark coefficient')
        monthly = []
        for stored in model['validation']['monthlyPredictions']:
            i = next(j for j, r in enumerate(rows) if r['month'] == stored['month'])
            b = np.linalg.lstsq(x[:i], y[:i], rcond=None)[0]
            a = np.linalg.lstsq(base[:i], y[:i], rcond=None)[0]
            values = {'actual': float(y[i]), 'model': float(x[i] @ b), 'baseline': float(base[i] @ a)}
            for key, expected in values.items():
                close(stored[key], expected, 'monthly retail-price prediction')
            equal(stored['trainingEnd'], rows[i-1]['month'], 'household monthly training boundary')
            monthly.append({**stored, **values})
            COUNTS['householdMonthlyPredictions'] += 1
        for stored in model['validation']['annualPredictions']:
            i = next(j for j, r in enumerate(rows) if r['month'] == f"{stored['year']}-01")
            paths = []
            for matrix in [x, base]:
                b = np.linalg.lstsq(matrix[:i], y[:i], rcond=None)[0]
                last = y[i-1]; level = rows[i]['previous']; path = []
                for j in range(i, i+12):
                    features = matrix[j].copy(); features[1] = last
                    last = float(features @ b); level *= math.exp(last / 100); path.append(level)
                paths.append(float(np.mean(path)))
            actual = float(np.mean([r['level'] for r in rows[i:i+12]]))
            for key, expected in [('actual', actual), ('model', paths[0]), ('baseline', paths[1]),
                                  ('modelErrorPct', 100*(paths[0]/actual-1)), ('baselineErrorPct', 100*(paths[1]/actual-1))]:
                close(stored[key], expected, 'annual recursive retail-price prediction')
            equal(stored['trainingEnd'], rows[i-1]['month'], 'household annual training boundary')
            COUNTS['householdAnnualPredictions'] += 1
        improved = []
        for period, start, end in [('development', '2015-01', '2019-12'), ('audit', '2020-01', '2025-12')]:
            records = [r for r in monthly if start <= r['month'] <= end]
            mae = float(np.mean([abs(r['model']-r['actual']) for r in records]))
            baseline = float(np.mean([abs(r['baseline']-r['actual']) for r in records]))
            improvement = 100*(1-mae/baseline)
            close(model['validation']['monthly'][period]['improvementPct'], improvement, 'household acceptance period')
            improved.append(len(records) >= 60 and improvement >= 10)
        for temporary in [False, True]:
            deltas = []; levels = []
            for month in range(24):
                delta = float(beta[1]) * (deltas[-1] if deltas else 0)
                delta += sum(float(b) * (int(month-j == 0)-int(temporary and month-j == 6)) for j, b in enumerate(beta[13:]))
                deltas.append(delta); levels.append(sum(deltas))
            for actual, expected in zip(model['responseElasticities']['temporary' if temporary else 'persistent'], levels):
                close(actual, expected, 'retail impulse response')
            if not temporary:
                passes = all(improved) and abs(beta[1]) < .98 and np.mean(levels[:12]) > 0
                equal(model['status'], 'supported' if passes else 'exploratory', 'household admission decision')


def public_output_audit():
    code = """
import fs from 'node:fs';
import {summarizeProvincialPriceResponse, summarizeHouseholdEnergyCosts} from './price-response-model.mjs';
import {summarizeProvincialImpacts} from './provincial-impact-model.mjs';
const load=n=>JSON.parse(fs.readFileSync(`data/${n}.json`));
const p=load('provincial-price-response'),h=load('household-energy-costs'),f=load('energy-flows'),b=load('provincial-impacts');
const results=[];
for(const shockPct of [-20,-10,0,10,20])for(const commodity of ['oil','gas','electricity']){
 const regions=['NL','PE','NS','NB','QC','ON','MB','SK','AB','BC','YT','NT','NU'];
 results.push({shockPct,commodity,gdp:[0,1].map(horizonYears=>summarizeProvincialPriceResponse(p,{shockPct,commodity,regions,horizonYears})),
 households:['benchmark','retail'].map(basis=>summarizeHouseholdEnergyCosts(h,{shockPct,commodity,regions,basis})),
 fiscal:summarizeProvincialImpacts(f,b,{shockPct,commodity}).fiscal.rows});
}
console.log(JSON.stringify(results));
"""
    output = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', code], cwd=ROOT, text=True))
    for scenario in output:
        shock = scenario['shockPct']; commodity = scenario['commodity']
        for horizon in scenario['gdp']:
            for row in horizon['rows']:
                model = next((r for r in DATA['provincial-price-response']['models'] if (r['region'],r['commodity'],r['horizonYears']) == (row['region'],commodity,horizon['horizonYears'])), None)
                if model is None:
                    equal(row['status'], 'unavailable', 'GDP missing model')
                    equal(row['estimatePct'], None, 'no inferred GDP zero')
                else:
                    close(row['estimatePct'], 100*((1+shock/100)**model['coefficient']-1), 'GDP scenario level difference')
                    expected = sorted(100*((1+shock/100)**model['parameterRange'][k]-1) for k in ['low','high'])
                    close(row['lowerPct'], expected[0], 'GDP lower parameter endpoint')
                    close(row['upperPct'], expected[1], 'GDP upper parameter endpoint')
                    equal(row['status'], 'supported' if model['validation']['passesScreen'] else 'exploratory', 'GDP UI eligibility')
        for household in scenario['households']:
            for row in household['rows']:
                base = next((r for r in DATA['household-energy-costs']['spendingBaselines'] if (r['region'],r['commodity']) == (row['region'],commodity)), None)
                model = next((r for r in DATA['household-energy-costs']['calibrations'] if (r['region'],r['commodity']) == (row['region'],commodity)), None)
                supported = base and base['status'] == 'available' and (household['basis'] == 'retail' or model and model['status'] == 'supported')
                if not supported:
                    equal(row['annualChangeCad'], None, 'no unsupported household dollars')
                    continue
                retail_pct = shock if household['basis'] == 'retail' else float(np.mean([100*((1+shock/100)**e-1) for e in model['responseElasticities']['persistent'][:12]]))
                expected = base['currentAnnualCad'] * retail_pct / 100
                close(row['annualChangeCad'], expected, 'annual household spending difference')
                close(row['monthlyEquivalentCad'], expected/12, 'monthly spending equivalent')
                if household['basis'] == 'benchmark':
                    draws = [base['currentAnnualCad']*float(np.mean([(1+shock/100)**e-1 for e in draw[:12]])) for draw in model['responseDraws']['persistent']]
                    close(row['lowerAnnualCad'], float(np.quantile(draws,.05)), 'household lower parameter endpoint')
                    close(row['upperAnnualCad'], float(np.quantile(draws,.95)), 'household upper parameter endpoint')
        for row in scenario['fiscal']:
            if not row['available']:
                equal(row['revenueChangeLow'], None, 'no unsupported fiscal dollars')
                continue
            base = next(r for r in DATA['provincial-impacts']['calibrations'] if (r['region'],r['commodity']) == (row['region'],commodity))
            scale = base['baselinePrice']*shock/100/base['priceChangeUnit']
            expected = sorted(base[k]*scale for k in ['publishedImpactLow','publishedImpactHigh'])
            close(row['revenueChangeLow'], expected[0], 'published fiscal sensitivity lower')
            close(row['revenueChangeHigh'], expected[1], 'published fiscal sensitivity upper')


def guided_integration_audit():
    code = """
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {summarizeGuidedConnection} from './guided-scenario-model.mjs';
const load=n=>JSON.parse(fs.readFileSync(`data/${n}.json`));
const flows=load('energy-flows');
const snapshot={fiscal:load('provincial-impacts'),priceResponses:load('provincial-price-response'),householdCosts:load('household-energy-costs')};
const results=[];
const run=(input,data=flows,sources=snapshot)=>summarizeGuidedConnection(data,sources,input);
for(const tradeCommodity of ['oil','gas','electricity'])for(const priceShock of [-20,0,20])for(const guideHorizon of [0,1])for(const guideHouseholdBasis of ['benchmark','retail']){
 const input={tradeConnection:'AB-BC',tradeCommodity,tradeYear:2024,priceShock,guideHorizon,guideHouseholdBasis,guideRetailShock:-7};
 results.push(run(input));
}
const input={tradeConnection:'AB-BC',tradeCommodity:'oil',tradeYear:2024,priceShock:10};
const original=run(input),altered=structuredClone(flows);
const link=altered.trade.observations.find(r=>r.origin==='AB'&&r.destination==='BC'&&r.commodity==='oil'&&r.year===2024);
link.value*=2;for(const component of link.components)component.value*=2;
const doubled=run(input,altered);
assert.equal(doubled.exchange.change,2*original.exchange.change);
for(let i=0;i<2;i++)for(const channel of ['fiscal','gdp','household'])assert.deepEqual(doubled.provinces[i][channel],original.provinces[i][channel],`Link size must not allocate ${channel}`);
const retail=run({...input,guideHouseholdBasis:'retail',guideRetailShock:-7});
const retailAgain=run({...input,priceShock:-20,guideHouseholdBasis:'retail',guideRetailShock:-7});
for(let i=0;i<2;i++)assert.deepEqual(retail.provinces[i].household,retailAgain.provinces[i].household,'Explicit retail scenario is independent of benchmark slider');
const reverse=run({...input,tradeConnection:'BC-AB'});
for(const row of original.provinces)for(const channel of ['fiscal','gdp','household'])assert.deepEqual(reverse.provinces.find(r=>r.region===row.region)[channel],row[channel],'Direction does not determine province-wide model coefficients');
const unavailable=run(input,flows,null);
assert.deepEqual(unavailable.exchange,original.exchange);
for(const row of unavailable.provinces){assert.equal(row.gdp.estimatePct,null);assert.equal(row.household.annualChangeCad,null);assert.equal(row.fiscal,null);}
const missing=structuredClone(flows),missingLink=missing.trade.observations.find(r=>r.origin==='AB'&&r.destination==='BC'&&r.commodity==='oil'&&r.year===2024);
missingLink.value=null;missingLink.status='suppressed';for(const c of missingLink.components){c.value=null;c.status='suppressed';}
const missingResult=run(input,missing);assert.equal(missingResult.exchange.change,null);assert.equal(missingResult.exchange.available,false);
assert.throws(()=>run({...input,tradeConnection:'AB-ROW'}));
assert.throws(()=>run({...input,priceShock:21}));
assert.throws(()=>run({...input,guideRetailShock:21}));
assert.throws(()=>run({...input,guideHorizon:2}));
console.log(JSON.stringify({results,invariants:28}));
"""
    output = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', code], cwd=ROOT, text=True))
    for result in output['results']:
        selection = result['selection']
        commodity = selection['commodity']; shock = selection['priceShock']
        link = next(r for r in DATA['energy-flows']['trade']['observations'] if (r['origin'],r['destination'],r['commodity'],r['year']) == ('AB','BC',commodity,2024))
        close(result['exchange']['change'], link['value']*shock/100, 'guided bilateral repricing')
        close(result['exchange']['scenarioValue'], link['value']*(1+shock/100), 'guided revised exchange value')
        equal(result['exchange']['sellerReceiptsChange'], result['exchange']['buyerCostsChange'], 'one transaction has equal sales and purchase change')
        for row in result['provinces']:
            model = next((r for r in DATA['provincial-price-response']['models'] if (r['region'],r['commodity'],r['horizonYears']) == (row['region'],commodity,selection['guideHorizon'])),None)
            if model and model['validation']['passesScreen']:
                close(row['gdp']['estimatePct'], 100*((1+shock/100)**model['coefficient']-1), 'guided accepted GDP amount')
            else:
                equal(row['gdp']['estimatePct'], None, 'guided rejected GDP point estimate hidden')
                equal(row['gdp']['lowerPct'], None, 'guided rejected GDP parameter range hidden')
            base = next(r for r in DATA['household-energy-costs']['spendingBaselines'] if (r['region'],r['commodity']) == (row['region'],commodity))
            household_model = next((r for r in DATA['household-energy-costs']['calibrations'] if (r['region'],r['commodity']) == (row['region'],commodity)),None)
            if selection['guideHouseholdBasis'] == 'retail':
                close(row['household']['annualChangeCad'], base['currentAnnualCad'] * -7/100, 'guided independent retail assumption')
            elif household_model and household_model['status'] == 'supported':
                expected = base['currentAnnualCad']*float(np.mean([(1+shock/100)**e-1 for e in household_model['responseElasticities']['persistent'][:12]]))
                close(row['household']['annualChangeCad'], expected, 'guided accepted household response')
            else:
                equal(row['household']['annualChangeCad'], None, 'guided rejected transmission hidden')
    COUNTS['guidedCases'] = len(output['results'])
    COUNTS['guidedInvarianceAssertions'] = output['invariants']


gdp_audit()
household_audit()
public_output_audit()
guided_integration_audit()
print(json.dumps({'status': 'passed', 'checks': CHECKS, 'maxAbsoluteDifference': MAX_DIFFERENCE, 'counts': COUNTS,
                  'gdpSupported': sum(m['validation']['passesScreen'] for m in DATA['provincial-price-response']['models']),
                  'householdSupported': sum(m['status']=='supported' for m in DATA['household-energy-costs']['calibrations']),
                  'snapshots': {name: {'dataVersion': DATA[name]['dataVersion'], 'sha256': hashlib.sha256((ROOT/'data'/f'{name}.json').read_bytes()).hexdigest()} for name in FILES}}, indent=2))
