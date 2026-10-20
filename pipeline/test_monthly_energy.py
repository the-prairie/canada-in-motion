"""Monthly source semantics, validation gates and reproducibility checks."""
import csv
import io
import json
from pathlib import Path
import unittest
import zipfile

from refresh_monthly_energy import (
    REGIONS, SPECS, build_snapshot, month_window,
    observation, parse_metadata, parse_metric,
)


def source_row(metric='oil', **changes):
    spec = SPECS[metric]
    return {
        'REF_DATE': '2026-07', 'GEO': 'Canada', 'DGUID': '2021A000011124',
        **spec['selectors'], 'UOM': spec['sourceUnit'], 'UOM_ID': '72',
        'SCALAR_FACTOR': spec['sourceScale'], 'SCALAR_ID': '0',
        'VECTOR': 'v123', 'COORDINATE': '1.1.1', 'VALUE': '100',
        'STATUS': '', 'SYMBOL': '', 'TERMINATED': '', 'DECIMALS': '0',
        **changes,
    }


def source_archive(metric='oil', rows=None, fields=None):
    rows = rows if rows is not None else [source_row(metric), source_row(metric, GEO='Alberta')]
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=fields or list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        archive.writestr(SPECS[metric]['table'] + '.csv', stream.getvalue())
    return buffer.getvalue()


def metadata(metric='oil', **changes):
    spec = SPECS[metric]
    return json.dumps([{'status': 'SUCCESS', 'object': {
        'productId': spec['table'], 'archiveStatusCode': '2', 'frequencyCode': 6,
        'cubeEndDate': '2026-07-01', 'releaseTime': '2026-09-29T08:30',
        'cubeTitleEn': spec['title'], **changes}}]).encode()


def at(metric, region, month='2026-07'):
    return next(row for row in metric['observations'] if row['region'] == region and row['month'] == month)


class MonthlyEnergyTests(unittest.TestCase):
    def test_consecutive_window_crosses_year_and_leap_boundaries(self):
        months = month_window('2026-01')
        self.assertEqual((len(months), months[0], months[-1]), (36, '2023-02', '2026-01'))
        self.assertIn('2024-02', months)
        self.assertIn('2024-03', months)
        for bad in ['2026-1', '2026-00', '2026-13', '2026-07-01']:
            with self.subTest(bad=bad), self.assertRaisesRegex(ValueError, 'monthly reference'):
                month_window(bad)

    def test_full_grid_missing_geographies_do_not_become_zero(self):
        metric = parse_metric(source_archive(), 'oil')
        self.assertEqual(len(metric['observations']), 36 * len(REGIONS))
        self.assertEqual(at(metric, 'PE')['status'], 'not-reported')
        self.assertIsNone(at(metric, 'PE')['value'])
        self.assertIsNone(at(metric, 'PE')['vector'])
        self.assertEqual(at(metric, 'CA')['value'], 100)

    def test_published_national_aggregate_is_not_provincial_sum(self):
        rows = [source_row(VALUE='900'), source_row(GEO='Alberta', VALUE='500'),
                source_row(GEO='Atlantic provinces', VALUE='150'),
                source_row(GEO='Newfoundland and Labrador', VALUE='100')]
        result = parse_metric(source_archive(rows=rows), 'oil')
        self.assertEqual(at(result, 'CA')['value'], 900)
        self.assertEqual(at(result, 'NL')['value'], 100)
        self.assertFalse(any(row['region'] == 'Atlantic provinces' for row in result['observations']))

    def test_gas_converts_thousands_of_gigajoules_without_float_noise(self):
        row = source_row('gas', VALUE='451358.6', DECIMALS='1')
        self.assertEqual(observation(row, SPECS['gas'])['value'], 451358600)
        self.assertEqual(observation(row | {'VALUE': '0.0'}, SPECS['gas'])['value'], 0)

    def test_active_gas_history_is_used_without_splicing_archived_source(self):
        rows = [source_row('gas'), source_row('gas', GEO='Alberta'),
                source_row('gas', REF_DATE='2025-07', VALUE='50', SYMBOL='r')]
        result = parse_metric(source_archive('gas', rows), 'gas')
        self.assertEqual(result['sourceId'], 'statcan-25100086')
        self.assertEqual(at(result, 'CA', '2025-07')['value'], 50000)
        self.assertEqual(at(result, 'CA', '2025-07')['sourceSymbol'], 'r')
        self.assertEqual(at(result, 'CA', '2024-07')['status'], 'not-reported')

    def test_zero_is_available_but_suppression_is_never_reconstructed(self):
        spec = SPECS['oil']
        self.assertEqual(observation(source_row(VALUE='0'), spec)['status'], 'available')
        for flag, expected in [('x', 'suppressed'), ('..', 'missing'), ('...', 'not-applicable'), ('F', 'unreliable')]:
            with self.subTest(flag=flag):
                result = observation(source_row(STATUS=flag, VALUE='123'), spec)
                self.assertIsNone(result['value'])
                self.assertEqual(result['status'], expected)
                self.assertEqual(result['sourceStatus'], flag)
        self.assertEqual(observation(source_row(VALUE=''), spec)['status'], 'missing')

    def test_revision_symbols_and_statuses_are_preserved_separately(self):
        revised = observation(source_row('electricity', SYMBOL='r'), SPECS['electricity'])
        self.assertEqual((revised['sourceStatus'], revised['sourceSymbol'], revised['status']), ('', 'r', 'available'))
        preliminary = observation(source_row(STATUS='p'), SPECS['oil'])
        self.assertEqual(preliminary['sourceStatus'], 'p')
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            observation(source_row(STATUS='x', SYMBOL='r'), SPECS['oil'])

    def test_rejects_status_unit_scale_vector_and_precision_drift(self):
        for changes, message in [({'STATUS': 'unexpected'}, 'status'), ({'SYMBOL': 'unexpected'}, 'status'),
                                 ({'UOM': 'Barrels'}, 'unit'), ({'SCALAR_FACTOR': 'millions'}, 'scalar'),
                                 ({'VECTOR': ''}, 'vector'), ({'TERMINATED': 't'}, 'terminated'),
                                 ({'DECIMALS': '-1'}, 'precision'), ({'VALUE': '100.1'}, 'precision')]:
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, message):
                observation(source_row(**changes), SPECS['oil'])

    def test_nonfinite_negative_and_invalid_values_fail_closed(self):
        for value in ['NaN', 'Infinity', '-1', 'not a value']:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, 'numeric'):
                observation(source_row(VALUE=value), SPECS['oil'])

    def test_duplicate_new_dimension_and_unknown_geography_fail_closed(self):
        row = source_row()
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            parse_metric(source_archive(rows=[row, row]), 'oil')
        with self.assertRaisesRegex(ValueError, 'dimensions'):
            parse_metric(source_archive(rows=[row | {'New dimension': 'Total'}]), 'oil')
        with self.assertRaisesRegex(ValueError, 'geography'):
            parse_metric(source_archive(rows=[row, source_row(GEO='New region')]), 'oil')

    def test_other_units_components_and_producer_classes_are_not_double_counted(self):
        rows = [source_row(), source_row(GEO='Alberta'),
                source_row(**{'Supply and disposition': 'Equivalent products production', 'VALUE': '1000'}),
                source_row(**{'Units of measure': 'Barrels', 'UOM': 'Barrels', 'VALUE': '2000'})]
        self.assertEqual(at(parse_metric(source_archive(rows=rows), 'oil'), 'CA')['value'], 100)
        electric = [source_row('electricity'), source_row('electricity', GEO='Alberta'),
                    source_row('electricity', **{'Class of electricity producer': 'Electric utilities', 'VALUE': '90'}),
                    source_row('electricity', **{'Type of electricity generation': 'Hydraulic turbine', 'VALUE': '50'})]
        self.assertEqual(at(parse_metric(source_archive('electricity', electric), 'electricity'), 'CA')['value'], 100)

    def test_unavailable_latest_canada_or_province_does_not_silently_backdate(self):
        for rows, message in [([source_row(), source_row(GEO='Alberta'), source_row(REF_DATE='2026-08', STATUS='..', VALUE='')], 'Canadian'),
                              ([source_row()], 'provincial')]:
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                parse_metric(source_archive(rows=rows), 'oil')

    def test_metric_end_months_are_independent(self):
        raws, metas, retrieved = {}, {}, {}
        periods = {'oil': '2026-07', 'gas': '2026-06', 'electricity': '2026-08'}
        for key, spec in SPECS.items():
            month = periods[key]
            raws[spec['table']] = source_archive(key, [source_row(key, REF_DATE=month), source_row(key, GEO='Alberta', REF_DATE=month)])
            metas[spec['table']] = metadata(key, cubeEndDate=month + '-01')
            retrieved[spec['table']] = '2026-10-20T00:00:00Z'
        snapshot = build_snapshot(raws, metas, retrieved, '2026-10-20T00:00:00Z')
        self.assertEqual({metric['id']: metric['latestMonth'] for metric in snapshot['metrics']}, periods)
        later = build_snapshot(raws, metas, {key: '2026-10-20T01:00:00Z' for key in retrieved}, '2026-10-20T01:00:00Z')
        self.assertEqual(later['dataVersion'], snapshot['dataVersion'])
        raws['25100063'] = source_archive('oil', [source_row(VALUE='99'), source_row(GEO='Alberta')])
        revised = build_snapshot(raws, metas, retrieved, '2026-10-20T01:00:00Z')
        self.assertNotEqual(revised['dataVersion'], snapshot['dataVersion'])

    def test_metadata_requires_active_monthly_table_and_matching_archive_month(self):
        for changes, pattern in [({'productId': '25100055'}, 'selected'), ({'archiveStatusCode': '1'}, 'selected'),
                                 ({'frequencyCode': 12}, 'selected'), ({'cubeEndDate': '2026-08-01'}, 'end-month'),
                                 ({'releaseTime': '2026-06-29T08:30'}, 'precedes')]:
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, pattern):
                parse_metadata(metadata(**changes), '25100063', '2026-07')

    def test_retained_published_artifact_has_complete_keys_and_known_july_values(self):
        snapshot = json.loads((Path(__file__).resolve().parents[1] / 'data/monthly-energy.json').read_text())
        self.assertEqual(snapshot['schemaVersion'], 1)
        for metric in snapshot['metrics']:
            self.assertEqual(len(metric['months']), 36)
            self.assertEqual(len({(row['region'], row['month']) for row in metric['observations']}), 504)
            self.assertEqual(at(metric, 'CA', metric['latestMonth'])['status'], 'available')
        # Check the independently vetted source vintage without freezing future
        # official revisions to historical values.
        known = {
            'oil': ('ab865eb6fba188119be03b954eaf119e6bc3862b4745b1e6a67c226414213273', 24876835),
            'gas': ('f9119875318ae35b31aae1a25ebabf6f4a82a97d6d2fd517d157e33834d6d225', 720483100),
            'electricity': ('4242b5a03daf9056716622b66136d2ba6c4f64b780d9e503518607646d8d818a', 54205473),
        }
        sources = {source['id']: source for source in snapshot['sources']}
        for metric in snapshot['metrics']:
            source_hash, value = known[metric['id']]
            if sources[metric['sourceId']]['sha256'] == source_hash:
                self.assertEqual(at(metric, 'CA')['value'], value)


if __name__ == '__main__':
    unittest.main()
