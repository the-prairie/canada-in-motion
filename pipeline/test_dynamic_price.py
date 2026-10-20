import io
import csv
import json
import math
from pathlib import Path
import unittest
from unittest.mock import patch
import zipfile

from refresh_dynamic_price import evaluate_model, fit, model_rows, parse_gdp, parse_wti


class DynamicPriceTests(unittest.TestCase):
    def test_pivoted_fit_matches_known_linear_system(self):
        x = [[1, i, i*i] for i in range(-5, 6)]
        y = [3 - 2*i + 0.25*i*i for i in range(-5, 6)]
        beta = fit(x, y)
        for actual, expected in zip(beta, [3, -2, .25]):
            self.assertAlmostEqual(actual, expected, places=10)
        with self.assertRaises(ValueError):
            fit([[1, 1]] * 6, [1] * 6)

    def test_local_projection_target_is_cumulative_and_lagged_control_is_past_only(self):
        gdp = {year: 100 * 1.02**(year-1980) for year in range(1980, 2025)}
        oil = {year: 10 + .2 * (year-1980)**2 for year in range(1980, 2025)}
        rows = model_rows(gdp, oil, {}, 2, 'price')
        for row in rows:
            self.assertAlmostEqual(row['y'], 300 * math.log(1.02), places=10)
            self.assertAlmostEqual(row['x'][1], 100 * math.log(1.02), places=10)
            self.assertEqual(row['outcomeYear'], row['year']+2)

    def test_backtest_does_not_train_on_future_outcome(self):
        rows = [{'year': y, 'outcomeYear': y+2, 'x': [1, (y%3)-1, (y%7)-3],
                 'baseline': [1, (y%3)-1], 'y': .3 * (y%5) + .1 * (y%7)} for y in range(1980,2023)]
        result = evaluate_model(rows, 2, 'price')
        self.assertGreater(result['heldoutCount'], 10)
        self.assertTrue(all(r['latestTrainingOutcomeYear'] < r['year'] for r in result['heldout']))
        first = result['heldout'][0]
        changed = [dict(r, y=1000 if r['year'] > first['year'] else r['y']) for r in rows]
        repeat = evaluate_model(changed, 2, 'price')['heldout'][0]
        self.assertEqual(first['modelPct'], repeat['modelPct'])
        self.assertFalse(result['publicScenarioEnabled'])

    def test_empty_holdout_has_no_zero_error_claim(self):
        result = evaluate_model([], 2, 'structural')
        self.assertIsNone(result['maePctPoints'])
        self.assertIsNone(result['improvementPct'])
        self.assertFalse(result['passesErrorScreen'])

    def test_wti_parser_excludes_partial_current_year(self):
        html = '<h1>Cushing WTI</h1>'
        for decade in range(1980, 2030, 10):
            html += "<tr><td>%d's</td>" % decade + ''.join("<td class='B3'>50</td>" for _ in range(10)) + '</tr>'
        rows = parse_wti(html.encode(), 2025)
        self.assertEqual(max(r['year'] for r in rows), 2025)
        with self.assertRaises(ValueError):
            parse_wti(html.replace("<td class='B3'>50</td>", '', 1).encode(), 2025)

    def test_unknown_gdp_quality_flag_stops_refresh(self):
        header=['REF_DATE','GEO','Prices','Estimates','UOM','SCALAR_FACTOR','VALUE','STATUS','VECTOR']
        text=io.StringIO(); writer=csv.DictWriter(text,fieldnames=header);writer.writeheader()
        writer.writerow(dict(zip(header,['2024','Alberta','Chained (2017) dollars','Gross domestic product at market prices','Dollars','millions','300000','new-suppression-flag','v123'])))
        raw=io.BytesIO()
        with zipfile.ZipFile(raw,'w') as archive:archive.writestr('36100222.csv',text.getvalue())
        with self.assertRaisesRegex(ValueError,'Unrecognized GDP status'):
            parse_gdp(raw.getvalue())

    def test_published_snapshot_reconciles_scores(self):
        data = json.loads((Path(__file__).resolve().parents[1] / 'data/dynamic-price-history.json').read_text())
        for model in data['experiments']:
            held = model['heldout']
            if held:
                actual = sum(abs(r['modelPct'] - r['actualPct']) for r in held)/len(held)
                self.assertAlmostEqual(actual, model['maePctPoints'], places=10)
            self.assertFalse(model['publicScenarioEnabled'])


if __name__ == '__main__':
    unittest.main()
