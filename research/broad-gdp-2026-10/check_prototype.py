"""Behavioral checks for the research prototype, not independent model review."""
import argparse
import copy
import gzip
import importlib.util
import json
import math
from pathlib import Path
import unittest


HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('broad_prototype', HERE / 'prototype.py')
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)
spec = importlib.util.spec_from_file_location('incumbent_reproduction', model.ROOT / 'tests/review/energy-forecast-independent-audit.py')
incumbent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(incumbent)


def indexed(rows):
    return {(r['region'], r['horizon'], r['originYear']): r for r in rows}


class PrototypeChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot, cls.baseline = model.load_incumbent()
        cls.series = json.loads(gzip.decompress((HERE / 'inputs/selected-series.json.gz').read_bytes()))
        cls.rows, cls.features = model.evaluate(cls.snapshot, cls.series, cls.baseline)
        cls.index = indexed(cls.rows)

    def assert_forecasts_equal(self, first, second, through=None):
        keys = [key for key in first if through is None or key[2] <= through]
        for key in keys:
            a, b = first[key], second[key]
            for field in ['selected', 'candidatePredictions', 'policyPct', 'lowerPct', 'upperPct', 'selectionScores']:
                self.assertEqual(a[field], b[field], (key, field))
        self.assertGreater(len(keys), 0)

    def test_saved_result_reproduces(self):
        saved = json.loads((HERE / 'results.json').read_text())
        self.assertEqual(saved['records'], self.rows)
        self.assertEqual(saved['horizons'], model.summarize(self.rows))

    def test_source_feature_arithmetic_matches_separate_parser(self):
        reference = {(r['region'], r['originYear']): r for r in json.loads(gzip.decompress((HERE / 'inputs/independent-features.json.gz').read_bytes()))}
        compared = 0
        for key, feature in self.features.items():
            for window in feature['windows']:
                other = reference[key]['windows'][window['metric'] + '-' + window['window']]
                for field, reference_field in [('currentMean', 'currentMean'), ('previousMean', 'previousMean'), ('value', 'change')]:
                    if other is None:
                        self.assertIsNone(window['value'])
                    else:
                        self.assertTrue(math.isclose(window[field], other[reference_field], abs_tol=1e-10, rel_tol=1e-10), (key, window, other))
                    compared += 1
        self.assertEqual(compared, len(self.features) * 24)

    def test_all_fit_selection_and_calibration_outcomes_precede_origin(self):
        for row in self.rows:
            if row['candidatePredictions']:
                self.assertLess(row['trainingMaxTargetYear'], row['originYear'])
                self.assertGreaterEqual(row['ownTrainingYears'], 10)
                self.assertEqual(set(row['candidatePredictions']), set(model.CANDIDATES))
            for score in row['selectionScores'].values():
                self.assertLess(score['maxTargetYear'], row['originYear'])
                self.assertGreaterEqual(score['count'], 5)
            if row['calibrationCount']:
                self.assertLess(row['calibrationMaxTargetYear'], row['originYear'])

    def test_future_gdp_cannot_change_earlier_forecasts(self):
        changed = copy.deepcopy(self.snapshot)
        for row in changed['history']['gdp']:
            if row['year'] >= 2020 and row['value'] is not None:
                row['value'] *= 2 + row['year'] % 3
        baseline = incumbent.reproduce_incumbent(changed)
        rows, _ = model.evaluate(changed, self.series, baseline)
        self.assert_forecasts_equal(self.index, indexed(rows), through=2020)

    def test_future_monthly_values_cannot_change_earlier_forecasts(self):
        changed = copy.deepcopy(self.series)
        snapshot = copy.deepcopy(self.snapshot)
        for rows in changed.values():
            for row in rows:
                if row['month'] >= '2021-01' and row['value'] is not None:
                    row['value'] *= 3 + int(row['month'][-2:]) / 12
        for row in snapshot['history']['employment']:
            if row['month'] >= '2021-01' and row['value'] is not None:
                row['value'] *= 3 + int(row['month'][-2:]) / 12
        baseline = incumbent.reproduce_incumbent(snapshot)
        rows, _ = model.evaluate(snapshot, changed, baseline)
        self.assert_forecasts_equal(self.index, indexed(rows), through=2020)

    def test_months_after_publication_cutoff_are_unused(self):
        changed = copy.deepcopy(self.series)
        for metric, rows in changed.items():
            cutoff = 9 if metric in ['employment', 'unemployment'] else 7
            for row in rows:
                if int(row['month'][-2:]) > cutoff and row['value'] is not None:
                    row['value'] = row['value'] * 17 + 834
        rows, features = model.evaluate(self.snapshot, changed, self.baseline)
        self.assertEqual(features, self.features)
        self.assert_forecasts_equal(self.index, indexed(rows))

    def test_missing_current_core_retains_incumbent_point(self):
        changed = copy.deepcopy(self.series)
        origin = self.snapshot['forecastOriginYear']
        for row in changed['manufacturing']:
            if row['region'] == 'AB' and row['month'] == f'{origin}-07':
                row.update(value=None, status='unavailable', sourceSymbol='x')
        rows, features = model.evaluate(self.snapshot, changed, self.baseline)
        self.assertFalse(features['AB', origin]['complete'])
        actual = indexed(rows)
        for horizon in [0, 1]:
            row = actual['AB', horizon, origin]
            self.assertEqual(row['candidatePredictions'], {})
            self.assertEqual(row['selected'], 'incumbent')
            self.assertEqual(row['policyPct'], row['baselinePct'])
        for key, row in self.index.items():
            if key[0] != 'AB':
                self.assertEqual(row['candidatePredictions'], actual[key]['candidatePredictions'])

    def test_missing_historical_core_is_excluded_from_fit(self):
        changed = copy.deepcopy(self.series)
        for row in changed['manufacturing']:
            if row['region'] == 'AB' and row['month'] == '2020-07':
                row.update(value=None, status='unavailable', sourceSymbol='x')
        rows, features = model.evaluate(self.snapshot, changed, self.baseline)
        actual = indexed(rows)
        self.assertFalse(features['AB', 2020]['complete'])
        self.assertFalse(features['AB', 2021]['complete'])
        self.assertEqual(actual['ON', 0, 2021]['trainingRows'], self.index['ON', 0, 2021]['trainingRows'] - 1)

    def test_unemployment_uses_percentage_point_changes(self):
        changed = copy.deepcopy(self.series)
        for row in changed['unemployment']:
            if row['region'] == 'AB' and row['month'].startswith('2026-'):
                row['value'] += 2
        features = model.source_features(self.snapshot, changed)
        for field in ['unemploymentYtdPp', 'unemploymentRecentPp']:
            self.assertAlmostEqual(features['AB', 2026]['values'][field] - self.features['AB', 2026]['values'][field], 2)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run author-side behavior checks without changing frozen receipts.')
    parser.add_argument('--receipt',type=Path,help='Write an optional new test receipt.')
    args = parser.parse_args()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(PrototypeChecks)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    receipt = {'passed': result.wasSuccessful(), 'testsRun': result.testsRun, 'failures': len(result.failures), 'errors': len(result.errors), 'scope': 'Prototype author behavioral checks, not independent model reproduction'}
    if args.receipt:
        assert args.receipt.resolve() != (HERE / 'prototype-checks.json').resolve(), 'Do not overwrite the frozen receipt.'
        args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt,indent=2))
    raise SystemExit(0 if result.wasSuccessful() else 1)
