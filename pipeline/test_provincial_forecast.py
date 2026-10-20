import copy
import json
import math
from pathlib import Path
import unittest

from refresh_provincial_forecast import (PROVINCES, build, growth, ridge, predict_fit,
                                        select_model, interval_radius, summarize_validation, wilson)


def synthetic_sources():
    gdp, employment = [], []
    for index, region in enumerate(PROVINCES):
        level, workers = 1000.0, 100.0
        for year in range(1996, 2027):
            labour_change = 2 * math.sin((year - 1996) * .8 + index * .3) + index * .07
            workers *= 1 + labour_change / 100
            for month in range(1, 13):
                if year < 2026 or month <= 9:
                    employment.append({'region': region, 'month': f'{year}-{month:02}', 'value': workers,
                                       'status': 'available', 'sourceId': 'labour'})
            if year <= 2025:
                level *= 1 + (1 + .8 * labour_change) / 100
                gdp.append({'region': region, 'year': year, 'value': level, 'status': 'available', 'sourceId': 'gdp'})
    return {'sources': [{'id': 'gdp'}, {'id': 'labour'}], 'gdp': gdp, 'employment': employment}


class ProvincialForecastTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = synthetic_sources()
        cls.snapshot = build(cls.source, '2026-10-20')

    def test_complete_forecasts_and_reproducibility(self):
        self.assertEqual(len(self.snapshot['forecasts']), 20)
        self.assertEqual(self.snapshot['dataVersion'], build(self.source, '2026-10-20')['dataVersion'])
        self.assertEqual(self.snapshot['information']['employmentThrough'], '2026-09')
        self.assertEqual({row['year'] for row in self.snapshot['forecasts']}, {2026, 2027})
        self.assertEqual([r['status'] for r in self.snapshot['regions'][-3:]], ['insufficient-indicator-coverage'] * 3)

    def test_all_training_selection_and_calibration_are_before_origin(self):
        for forecast in self.snapshot['forecasts']:
            for row in forecast['validation']['heldout']:
                self.assertLess(row['trainingMaxTargetYear'], row['originYear'])
                if row['calibrationMaxTargetYear'] is not None:
                    self.assertLess(row['calibrationMaxTargetYear'], row['originYear'])
                if row['selectionMaxTargetYear'] is not None:
                    self.assertLess(row['selectionMaxTargetYear'], row['originYear'])
                self.assertEqual(row['targetYear'], row['originYear'] + forecast['horizon'])
            for candidate in forecast['modelDetails']['candidates'].values():
                self.assertLess(candidate['fit']['trainingMaxTargetYear'], self.snapshot['forecastOriginYear'])

    def test_later_gdp_outcomes_cannot_change_earlier_predictions(self):
        changed = copy.deepcopy(self.source)
        for row in changed['gdp']:
            if row['year'] >= 2023:
                row['value'] *= 1.2
        later = build(changed, '2026-10-20')
        for before, after in zip(self.snapshot['forecasts'], later['forecasts']):
            for left, right in zip(before['validation']['heldout'], after['validation']['heldout']):
                if left['originYear'] <= 2023:
                    self.assertEqual(left['predictionPct'], right['predictionPct'])
                    self.assertEqual(left['lowerPct'], right['lowerPct'])
                    self.assertEqual(left['model'], right['model'])

    def test_target_year_future_employment_never_enters_next_year_prediction(self):
        changed = copy.deepcopy(self.source)
        for row in changed['employment']:
            if row['month'].startswith('2023-'):
                row['value'] *= 1.3
        later = build(changed, '2026-10-20')
        for before, after in zip(self.snapshot['forecasts'], later['forecasts']):
            for left, right in zip(before['validation']['heldout'], after['validation']['heldout']):
                if left['originYear'] < 2023:
                    self.assertEqual(left['predictionPct'], right['predictionPct'])
                    self.assertEqual(left['lowerPct'], right['lowerPct'])

    def test_selection_requires_past_outperformance_and_minimum_count(self):
        row = {'actualPct': 0, 'candidates': {'historical-mean': 1, 'shrunk-autoregression': .98,
                                             'employment-bridge': .8, 'pooled-employment-bridge': .9}}
        self.assertEqual(select_model([row] * 4)[0], 'historical-mean')
        self.assertEqual(select_model([row] * 5)[0], 'employment-bridge')
        row['candidates']['employment-bridge'] = .97
        row['candidates']['pooled-employment-bridge'] = .96
        self.assertEqual(select_model([row] * 5)[0], 'historical-mean')

    def test_calibration_is_an_error_range_not_zero_when_unavailable(self):
        errors = [{'predictionPct': x, 'actualPct': 0} for x in [1, 2, 3, 4, 5]]
        self.assertIsNone(interval_radius(errors[:4]))
        self.assertEqual(interval_radius(errors), 5)
        self.assertEqual(wilson(0, 0), None)
        lo, hi = wilson(8, 10)
        self.assertLess(lo, .8)
        self.assertGreater(hi, .8)

    def test_ridge_handles_zero_variance_and_keeps_province_intercepts(self):
        rows = [{'region': region, 'targetYear': year, 'y': y, 'features': {'constant': 5}}
                for region, y in [('AB', 2), ('ON', 4)] for year in range(2000, 2010)]
        fitted = ridge(rows, 'AB', ['constant'])
        self.assertEqual(predict_fit(fitted, {'constant': 5}), 2)
        self.assertEqual(fitted['coefficients']['constant'], 0)

    def test_missing_current_employment_fails_instead_of_using_zero(self):
        broken = copy.deepcopy(self.source)
        broken['employment'] = [row for row in broken['employment'] if not (row['region'] == 'AB' and row['month'] == '2026-04')]
        with self.assertRaisesRegex(ValueError, 'Incomplete current predictors'):
            build(broken, '2026-10-20')

    def test_spring_refresh_uses_the_available_month_in_every_historical_fold(self):
        source = copy.deepcopy(self.source)
        source['employment'] = [row for row in source['employment'] if row['month'] <= '2026-04']
        snapshot = build(source, '2026-05-10')
        self.assertEqual(snapshot['information']['employmentThrough'], '2026-04')
        self.assertEqual(snapshot['information']['employmentCutoffMonth'], 4)
        self.assertEqual(len(snapshot['forecasts']), 20)

    def test_rejects_future_information(self):
        with self.assertRaises(ValueError):
            build(self.source, '2025-10-20')
        with self.assertRaises(ValueError):
            build(self.source, '2026-07-01')
        with self.assertRaises(ValueError):
            growth(100, 0)

    def test_scores_and_coverage_match_saved_predictions(self):
        for forecast in self.snapshot['forecasts']:
            validation = forecast['validation']
            rows = validation['heldout']
            expected = sum(abs(row['predictionPct'] - row['actualPct']) for row in rows) / len(rows)
            self.assertAlmostEqual(validation['mae'], expected)
            intervals = [row for row in rows if row['lowerPct'] is not None]
            covered = sum(row['lowerPct'] <= row['actualPct'] <= row['upperPct'] for row in intervals)
            self.assertEqual(validation['intervalCount'], len(intervals))
            self.assertEqual(validation['intervalCoverage'], covered / len(intervals))
            self.assertEqual(summarize_validation(rows)['mae'], validation['mae'])


if __name__ == '__main__':
    unittest.main()
