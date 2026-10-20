import copy
import json
import math
from pathlib import Path
import statistics
import unittest

from refresh_price_response import build_model, choose, fit, make_rows, metrics, parse_gas

ROOT = Path(__file__).resolve().parents[1]


class PriceResponseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / 'data/provincial-price-response.json').read_text())
        cls.gdp = cls.data['history']['gdp']
        cls.oil = {r['year']: r['value'] for r in cls.data['history']['prices'] if r['commodity'] == 'oil'}

    def test_model_is_conditional_and_does_not_enable_a_causal_forecast(self):
        self.assertEqual(self.data['method'], 'conditional-historical-energy-price-response')
        self.assertIn('not a causal impact', self.data['methodology']['interpretation'])
        self.assertIn('not forecasts available', self.data['methodology']['validationScope'])
        self.assertEqual(self.data['unsupported'][0]['commodity'], 'electricity')

    def test_every_model_preserves_sources_and_failed_screens(self):
        self.assertEqual(len(self.data['models']), 52)
        sources = {s['id'] for s in self.data['sources']}
        for model in self.data['models']:
            self.assertTrue(set(model['sourceIds']) <= sources)
            self.assertEqual(model['validation']['passesScreen'], all(model['validation']['criteria'].values()))
            self.assertEqual(model['heldoutCount'], len(model['heldout']))
        self.assertTrue(any(not m['validation']['passesScreen'] for m in self.data['models']))

    def test_each_origin_uses_only_earlier_gdp_for_training_and_selection(self):
        for model in self.data['models']:
            for row in model['heldout']:
                self.assertLess(row['trainingEnd'], row['year'])
                if row['latestSelectionOutcomeYear'] is not None:
                    self.assertLess(row['latestSelectionOutcomeYear'], row['year'])
                self.assertEqual(row['outcomeYear'], row['year'] + model['horizonYears'])

    def test_validation_scores_recompute_from_all_heldout_predictions(self):
        for model in self.data['models']:
            expected = metrics(model['heldout'])
            if expected:
                for key, value in expected.items():
                    self.assertAlmostEqual(value, model['validation'][key])

    def test_future_outcomes_do_not_change_earlier_predictions(self):
        altered = copy.deepcopy(self.gdp)
        for row in altered:
            if row['year'] == 2024 and row['status'] == 'available':
                row['value'] *= 1.5
        first = build_model(self.gdp, self.oil, 'oil', 'AB', 0, 20)
        second = build_model(altered, self.oil, 'oil', 'AB', 0, 20)
        self.assertEqual([r['modelPct'] for r in first['heldout']], [r['modelPct'] for r in second['heldout']])
        self.assertNotEqual(first['heldout'][-1]['actualPct'], second['heldout'][-1]['actualPct'])

    def test_gas_fallback_keeps_twelve_published_months(self):
        derived = [r for r in self.data['history']['prices'] if r['commodity'] == 'gas' and r['aggregation'] == 'mean of 12 monthly averages']
        for row in derived:
            months = [m for m in self.data['history']['gasMonthly'] if m['year'] == row['year']]
            self.assertEqual({m['month'] for m in months}, set(range(1, 13)))
            self.assertAlmostEqual(row['value'], statistics.mean(m['value'] for m in months))
            self.assertEqual(row['sourceId'], 'eia-henry-hub-monthly')

    def test_bootstrap_range_is_not_an_outcome_error_range(self):
        for row in self.data['models']:
            uncertainty = row['parameterRange']
            self.assertLessEqual(uncertainty['low'], uncertainty['high'])
            self.assertEqual(uncertainty['level'], .8)
            self.assertIn('excludes model-selection', uncertainty['scope'])
            self.assertGreaterEqual(uncertainty['successfulFits'], .95 * uncertainty['replicates'])

    def test_nested_choice_uses_prior_accuracy_and_defaults_to_local(self):
        self.assertEqual(choose([], 'candidatePredictions', ['own', 'pool']), 'own')
        prior = [{'actualPct': 2, 'candidatePredictions': {'own': 4, 'pool': 1.9}} for _ in range(5)]
        self.assertEqual(choose(prior, 'candidatePredictions', ['own', 'pool']), 'pool')

    def test_following_year_target_is_cumulative(self):
        rows = make_rows(self.gdp, self.oil, 'AB', 1)
        row = next(r for r in rows if r['year'] == 2022)
        gdp = {r['year']: r['value'] for r in self.gdp if r['region'] == 'AB'}
        self.assertAlmostEqual(row['y'], 100 * math.log(gdp[2023] / gdp[2021]))
        self.assertEqual(row['outcomeYear'], 2023)

    def test_fit_recovers_known_log_relationship(self):
        rows = [{'lagGrowth': float(i % 4), 'price': float(i), 'y': 2 + .3 * (i % 4) + .05 * i} for i in range(20)]
        result = fit(rows, ['lagGrowth', 'price'])
        self.assertAlmostEqual(result['intercept'], 2)
        self.assertAlmostEqual(result['coefficients']['lagGrowth'], .3)
        self.assertAlmostEqual(result['coefficients']['price'], .05)

    def test_ab_historical_instability_is_not_relaxed(self):
        fixed_history = [r for r in self.gdp if r['year'] <= 2024]
        fixed_prices = {year: value for year, value in self.oil.items() if year <= 2024}
        model = build_model(fixed_history, fixed_prices, 'oil', 'AB', 0, 20)
        self.assertGreater(model['validation']['improvementPct'], 0)
        self.assertFalse(model['validation']['criteria']['stableSign'])
        self.assertFalse(model['validation']['passesScreen'])


if __name__ == '__main__':
    unittest.main()
