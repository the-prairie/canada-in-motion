import copy
import unittest
from unittest.mock import patch

from provincial_energy_forecast import energy_features, evaluate_energy, attach_energy_evaluation, PROTOCOL
from refresh_monthly_energy import parse_metric
from test_monthly_energy import source_archive, source_row
from test_provincial_forecast import synthetic_sources
from refresh_provincial_forecast import build


def energy_history():
    observations = []
    for year, value in [(2025, 100), (2026, 110)]:
        for month in range(1, 13):
            observations.append({'region': 'AB', 'month': f'{year}-{month:02}', 'value': value, 'status': 'available'})
    return {'sources': [], 'metrics': [{'id': 'oil', 'unit': 'm3', 'sourceId': 'oil',
            'months': ['2025-01', '2026-12'], 'observations': observations}]}


class EnergyForecastTests(unittest.TestCase):
    def test_full_history_option_preserves_default_public_window(self):
        rows = [source_row(REF_DATE='2016-01'), source_row(), source_row(GEO='Alberta')]
        raw = source_archive(rows=rows)
        self.assertEqual(len(parse_metric(raw, 'oil')['months']), 36)
        full = parse_metric(raw, 'oil', retain_months=None)
        self.assertEqual(full['months'][0], '2016-01')
        self.assertEqual(full['months'][-1], '2026-07')
        self.assertEqual(len(full['months']), 127)

    def test_only_january_july_totals_enter_the_energy_feature(self):
        history = energy_history()
        expected = energy_features(history, 2026)['oil', 'AB', 2026]
        self.assertAlmostEqual(expected['growthPct'], 10)
        self.assertEqual(expected['currentTotal'], 770)
        for row in history['metrics'][0]['observations']:
            if row['month'][5:] > '07':
                row['value'] *= 1000000
        self.assertEqual(energy_features(history, 2026)['oil', 'AB', 2026], expected)

    def test_suppression_missing_month_and_zero_denominator_are_not_imputed(self):
        for mode in ['suppressed', 'missing', 'zero']:
            history = energy_history()
            observations = history['metrics'][0]['observations']
            if mode == 'missing':
                observations.pop(0)
            elif mode == 'suppressed':
                observations[0].update(status='suppressed', value=None)
            else:
                for row in observations:
                    if row['month'].startswith('2025'):
                        row['value'] = 0
            feature = energy_features(history, 2026)['oil', 'AB', 2026]
            self.assertIsNone(feature['growthPct'])
            self.assertNotEqual(feature['status'], 'available')

    def test_electricity_break_is_excluded_even_when_values_are_present(self):
        history = energy_history()
        history['metrics'][0].update(id='electricity', months=['2015-01', '2016-12'])
        for row in history['metrics'][0]['observations']:
            row['month'] = row['month'].replace('2025', '2015').replace('2026', '2016')
        feature = energy_features(history, 2016)['electricity', 'AB', 2016]
        self.assertEqual(feature['status'], 'source-coverage-break')
        self.assertIsNone(feature['growthPct'])

    def test_unsupported_information_cutoffs_do_not_run_the_experiment(self):
        for date, cutoff in [('2026-09-30', 9), ('2026-10-20', 8), ('2026-11-20', 10)]:
            snapshot = {'asOf': date, 'forecastOriginYear': 2026, 'information': {'employmentCutoffMonth': cutoff}}
            result = evaluate_energy(snapshot, {'sources': []})
            self.assertEqual(result['status'], 'outside-tested-cutoff')
            self.assertNotIn('records', result)

    def test_incumbent_retuning_cannot_silently_change_the_frozen_experiment(self):
        with patch('provincial_energy_forecast.incumbent.RIDGE_RATIO', 2):
            with self.assertRaisesRegex(ValueError, 'frozen energy protocol'):
                evaluate_energy({}, {})

    def test_attachment_preserves_all_incumbent_points_and_ranges(self):
        snapshot = build(synthetic_sources(), '2026-10-20')
        original = copy.deepcopy(snapshot)
        result = attach_energy_evaluation(snapshot, energy_history())
        self.assertEqual(result['forecasts'], original['forecasts'])
        self.assertEqual(result['sources'], original['sources'])
        self.assertFalse(result['energyEvaluation']['adopted'])
        self.assertNotEqual(result['dataVersion'], original['dataVersion'])
        self.assertEqual(PROTOCOL['productionPolicy'], 'retain-incumbent-until-independent-admission')


if __name__ == '__main__':
    unittest.main()
