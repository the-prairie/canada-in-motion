import copy
import csv
from datetime import date
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile

from broad_forecast_sources import SPECS, PROVINCES, parse_series, parse_metadata, load_broad_sources


def row(metric='retail', **changes):
    spec = SPECS[metric]
    return {'REF_DATE': '2026-07', 'GEO': 'Alberta', 'DGUID': '2016A000248', **spec['selectors'],
            'UOM': spec['sourceUnit'], 'UOM_ID': '81', 'SCALAR_FACTOR': spec['sourceScale'],
            'SCALAR_ID': '3', 'VECTOR': 'v1234', 'COORDINATE': '1.1', 'VALUE': '12345.6',
            'STATUS': '', 'SYMBOL': '', 'TERMINATED': '', 'DECIMALS': '1', **changes}


def archive(metric, rows):
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    raw = io.BytesIO()
    with ZipFile(raw, 'w') as zipped:
        zipped.writestr(SPECS[metric]['productId'] + '.csv', stream.getvalue())
    return raw.getvalue()


def metadata(metric, **changes):
    return json.dumps([{'status': 'SUCCESS', 'object': {
        'productId': SPECS[metric]['productId'], 'archiveStatusCode': '2', 'frequencyCode': 6,
        'cubeTitleEn': metric, 'cubeStartDate': '2026-06-01', 'cubeEndDate': '2026-07-01',
        'releaseTime': '2026-09-24T08:30', **changes}}]).encode()


class BroadForecastSourcesTests(unittest.TestCase):
    def test_exact_province_totals_preserve_source_units(self):
        for metric in SPECS:
            rows = [row(metric), row(metric, GEO='Canada'), row(metric, GEO='Toronto, Ontario')]
            selected = parse_series(archive(metric, rows), metric)
            self.assertEqual(len(selected), 1)
            self.assertEqual(selected[0]['region'], 'AB')
            self.assertEqual(selected[0]['value'], 12345.6)
            self.assertEqual(selected[0]['sourceId'], 'statcan-' + SPECS[metric]['productId'])

    def test_wrong_adjustment_industry_and_sales_measure_excluded(self):
        for metric in SPECS:
            rows = [row(metric)] + [row(metric, **{key: 'Other dimension member'}) for key in SPECS[metric]['selectors']]
            self.assertEqual(len(parse_series(archive(metric, rows), metric)), 1)

    def test_confidential_numeric_values_and_symbols_are_withheld(self):
        for changes, status in [({'STATUS': 'x'}, 'suppressed'), ({'SYMBOL': 'x'}, 'suppressed'),
                                ({'STATUS': 'F'}, 'unreliable'), ({'STATUS': '..'}, 'missing'),
                                ({'STATUS': '...'}, 'not-applicable')]:
            selected = parse_series(archive('retail', [row(**changes)]), 'retail')[0]
            self.assertIsNone(selected['value'])
            self.assertEqual(selected['status'], status)
            self.assertEqual(selected['sourceStatus'], changes.get('STATUS', ''))
            self.assertEqual(selected['sourceSymbol'], changes.get('SYMBOL', ''))

    def test_missing_and_published_zero_are_distinct(self):
        for value, expected in [('', None), ('0', 0)]:
            selected = parse_series(archive('manufacturing', [row('manufacturing', VALUE=value)]), 'manufacturing')[0]
            self.assertEqual(selected['value'], expected)
            self.assertEqual(selected['status'], 'missing' if value == '' else 'available')
        with self.assertRaisesRegex(ValueError, 'numeric'):
            parse_series(archive('cpi', [row('cpi', VALUE='0')]), 'cpi')

    def test_unit_period_vector_status_and_termination_drift_fail(self):
        for changes in [{'UOM': 'Index'}, {'SCALAR_FACTOR': 'millions'}, {'REF_DATE': '2026-13'},
                        {'VECTOR': ''}, {'STATUS': '?'}, {'SYMBOL': '?'}, {'TERMINATED': 't'},
                        {'VALUE': 'nan'}, {'VALUE': '-1'}, {'VALUE': 'inf'}]:
            with self.assertRaises(ValueError, msg=str(changes)):
                parse_series(archive('retail', [row(**changes)]), 'retail')

    def test_duplicate_month_and_schema_changes_fail(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            parse_series(archive('retail', [row(), row()]), 'retail')
        for changes in [{'new dimension': 'Total'}, {'SYMBOL': None}]:
            altered = row(**changes)
            if changes.get('SYMBOL', 'present') is None:
                altered.pop('SYMBOL')
            with self.assertRaisesRegex(ValueError, 'columns'):
                parse_series(archive('retail', [altered]), 'retail')

    def test_metadata_requires_active_monthly_table_current_release_and_coverage(self):
        rows = parse_series(archive('retail', [row()]), 'retail')
        for changes in [{'archiveStatusCode': '1'}, {'frequencyCode': 12}, {'productId': '1234'},
                        {'releaseTime': '2027-01-01'}, {'cubeEndDate': '2026-08-01'}]:
            with self.assertRaises(ValueError, msg=str(changes)):
                parse_metadata(metadata('retail', **changes), 'retail', rows, date(2026, 10, 20))
        with self.assertRaisesRegex(ValueError, 'coverage'):
            parse_metadata(metadata('retail'), 'retail', rows, date(2026, 10, 20))

    def test_offline_replay_verifies_receipts_and_original_retrieval(self):
        specs = copy.deepcopy(SPECS)
        for spec in specs.values():
            spec['minimumMonths'] = 2
        with tempfile.TemporaryDirectory() as temporary, patch('broad_forecast_sources.SPECS', specs):
            directory = Path(temporary)
            for metric, spec in specs.items():
                raw = archive(metric, [row(metric, GEO=name, REF_DATE=month) for name in PROVINCES for month in ['2026-06', '2026-07']])
                meta = metadata(metric)
                receipt = {'retrievedAt': '2026-10-20T12:00:00Z', 'sha256': hashlib.sha256(raw).hexdigest(),
                           'metadataSha256': hashlib.sha256(meta).hexdigest()}
                for suffix, content in [('-eng.zip', raw), ('-metadata.json', meta), ('-retrieval.json', json.dumps(receipt).encode())]:
                    (directory / (spec['productId'] + suffix)).write_bytes(content)
            result = load_broad_sources(directory, offline=True, as_of='2026-10-20')
            self.assertEqual({k: len(v) for k, v in result['series'].items()}, {k: 20 for k in specs})
            self.assertEqual(result['sources'][0]['retrievedAt'], '2026-10-20T12:00:00Z')
            for as_of in ['2026-10-19', '2026-10-29']:
                with self.assertRaisesRegex(ValueError, 'retrieval'):
                    load_broad_sources(directory, offline=True, as_of=as_of)
            receipt_file = directory / '20100056-retrieval.json'
            receipt = json.loads(receipt_file.read_text())
            receipt['sha256'] = '0' * 64
            receipt_file.write_text(json.dumps(receipt))
            with self.assertRaisesRegex(ValueError, 'receipt'):
                load_broad_sources(directory, offline=True, as_of='2026-10-20')


if __name__ == '__main__':
    unittest.main()
