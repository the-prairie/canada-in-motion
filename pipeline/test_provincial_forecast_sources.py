import csv
import io
import unittest
from zipfile import ZipFile

from provincial_forecast_sources import parse_gdp, parse_labour


def archive(code, rows):
    text = io.StringIO()
    writer = csv.DictWriter(text, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    data = io.BytesIO()
    with ZipFile(data, 'w') as target:
        target.writestr(code + '.csv', text.getvalue())
    return data.getvalue()


class ProvincialForecastSourceTests(unittest.TestCase):
    def gdp(self, **changes):
        return {'REF_DATE': '2025', 'GEO': 'Alberta', 'Prices': 'Chained (2017) dollars',
                'North American Industry Classification System (NAICS)': 'All industries [T001]',
                'UOM': 'Dollars', 'SCALAR_FACTOR': 'millions', 'VALUE': '361470.8',
                'STATUS': '', 'VECTOR': 'v123', **changes}

    def labour(self, **changes):
        return {'REF_DATE': '2026-09', 'GEO': 'Alberta', 'Labour force characteristics': 'Employment',
                'Gender': 'Total - Gender', 'Age group': '15 years and over', 'Statistics': 'Estimate',
                'Data type': 'Seasonally adjusted', 'UOM': 'Persons in thousands', 'SCALAR_FACTOR': 'thousands',
                'VALUE': '2700.1', 'STATUS': '', 'VECTOR': 'v456', **changes}

    def test_gdp_units_and_missing_values(self):
        result = parse_gdp(archive('36100711', [self.gdp(), self.gdp(GEO='Nunavut', VALUE='', STATUS='..')]))
        self.assertEqual(result[0]['value'], 361470.8)
        self.assertIsNone(result[1]['value'])
        self.assertEqual(result[1]['status'], 'not-published')

    def test_gdp_duplicate_and_unit_drift_fail(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            parse_gdp(archive('36100711', [self.gdp(), self.gdp()]))
        with self.assertRaisesRegex(ValueError, 'unit'):
            parse_gdp(archive('36100711', [self.gdp(SCALAR_FACTOR='billions')]))

    def test_monthly_employment_is_not_double_scaled(self):
        result = parse_labour(archive('14100287', [self.labour()]))
        self.assertEqual(result['employment'][0]['value'], 2700.1)
        self.assertEqual(result['employment'][0]['month'], '2026-09')

    def test_monthly_unemployment_keeps_real_zero(self):
        row = self.labour(**{'Labour force characteristics': 'Unemployment rate',
                             'UOM': 'Percent', 'SCALAR_FACTOR': 'units', 'VALUE': '0'})
        self.assertEqual(parse_labour(archive('14100287', [row]))['unemployment'][0]['value'], 0)

    def test_wrong_population_or_statistic_not_used(self):
        rows = [self.labour(Gender='Women+'), self.labour(**{'Age group': '15 to 24 years'}),
                self.labour(Statistics='Standard error of estimate'), self.labour(**{'Data type': 'Unadjusted'})]
        self.assertEqual(parse_labour(archive('14100287', rows)), {'employment': [], 'unemployment': []})

    def test_unknown_status_invalid_month_and_nonfinite_fail(self):
        for row in [self.labour(STATUS='new'), self.labour(REF_DATE='2026-13'), self.labour(VALUE='nan')]:
            with self.assertRaises(ValueError):
                parse_labour(archive('14100287', [row]))


if __name__ == '__main__':
    unittest.main()
