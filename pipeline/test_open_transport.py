import csv
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('open_transport', Path(__file__).with_name('open_transport.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

class BenchmarkDateTests(unittest.TestCase):
    def test_future_and_undated_rows_never_replace_latest_observation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            with (path / 'fixture.csv').open('w', newline='') as output:
                writer = csv.DictWriter(output, fieldnames=MODULE.TOLL_FIELDS)
                writer.writeheader()
                for date, value in [('2026-05-01', '3.20'), ('2027-01-01', '9.80'), ('', '5.00'), ('2025-01-01', '2.70')]:
                    writer.writerow({**dict.fromkeys(MODULE.TOLL_FIELDS, ''), 'Date': date, 'Pipeline Name': 'Fixture system', 'Toll': value, 'Unit': 'CAD/m3'})
            snapshot = MODULE.toll_snapshot({'name': 'Fixture', 'url': 'https://example.invalid/fixture.csv'}, path, True, '2026-10-17')
            self.assertEqual(snapshot['latestObservationDate'], '2026-05-01')
            self.assertEqual(snapshot['rows'][0]['Toll'], '3.20')
            self.assertEqual(snapshot['excludedFutureRows'], 1)
            self.assertEqual(snapshot['excludedUndatedRows'], 1)
            self.assertFalse(snapshot['eligibleForQuote'])

    def test_malformed_date_fails_instead_of_guessing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            with (path / 'fixture.csv').open('w', newline='') as output:
                writer = csv.DictWriter(output, fieldnames=MODULE.TOLL_FIELDS)
                writer.writeheader()
                writer.writerow({**dict.fromkeys(MODULE.TOLL_FIELDS, ''), 'Date': '01/02/2026', 'Pipeline Name': 'Fixture', 'Toll': '1', 'Unit': 'CAD/m3'})
            with self.assertRaises(ValueError):
                MODULE.toll_snapshot({'name': 'Fixture', 'url': 'https://example.invalid/fixture.csv'}, path, True, '2026-10-17')

if __name__ == '__main__':
    unittest.main()
