import contextlib
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
import copy
from datetime import datetime, timedelta, timezone
import csv
import io
import unittest
from refresh_alberta_status import build, parse_counts, offline_retrieved_at, reusable_snapshot, main, CATEGORIES


def fixture(year=2026):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Month (Years)', 'Well Lifecycle Status', '% of Total Well Licences', 'Well Licences'])
    for index, category in enumerate(CATEGORIES):
        count = 10 if index < 6 else 40
        writer.writerow([year, category, f'{count}%', str(count)])
    return output.getvalue().encode()


class AlbertaStatusTests(unittest.TestCase):
    def test_deploy_can_reuse_an_intact_daily_snapshot_without_changing_its_date(self):
        previous = build(fixture(), '2026-10-19T23:58:11Z')
        original = copy.deepcopy(previous)
        now = datetime(2026, 10, 20, 22, 20, tzinfo=timezone.utc)
        self.assertTrue(reusable_snapshot(previous, now))
        self.assertEqual(previous, original)
        self.assertTrue(reusable_snapshot(previous, datetime(2026, 10, 20, 23, 58, 11, tzinfo=timezone.utc)))
        self.assertFalse(reusable_snapshot(previous, datetime(2026, 10, 20, 23, 58, 12, tzinfo=timezone.utc)))
        self.assertFalse(reusable_snapshot(previous, now, max_age_hours=48))
        self.assertFalse(reusable_snapshot(previous, now, max_age_hours=0))
        self.assertFalse(reusable_snapshot(previous, datetime(2026, 10, 21, tzinfo=timezone.utc)))
        self.assertFalse(reusable_snapshot(previous, datetime(2026, 10, 19, tzinfo=timezone.utc)))
        changed = copy.deepcopy(previous)
        changed['latest']['counts']['active'] += 1
        self.assertFalse(reusable_snapshot(changed, now))
        changed = copy.deepcopy(previous)
        changed['retrievedAt'] = 'invalid'
        self.assertFalse(reusable_snapshot(changed, now))
        self.assertFalse(reusable_snapshot({}, now))

    def test_reuse_returns_before_download_and_preserves_original_file_bytes(self):
        stamp = (datetime.now(timezone.utc) - timedelta(hours=23)).isoformat()
        data = build(fixture(), stamp)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'status.json'
            output.write_text(json.dumps(data, indent=3) + '\n')
            original = output.read_bytes()
            with patch('sys.argv', ['refresh', '--output', str(output), '--max-age-hours', '24']), patch('refresh_alberta_status.subprocess.run', side_effect=AssertionError('No download expected')), contextlib.redirect_stdout(io.StringIO()) as log:
                main()
            self.assertEqual(output.read_bytes(), original)
            self.assertIn('reused-verified-snapshot', log.getvalue())
            self.assertIn(stamp, log.getvalue())

    def test_operating_includes_marginal_and_preserves_unknown_month(self):
        data = build(fixture(), '2026-10-19T00:00:00Z')
        self.assertEqual(data['latest']['operating'], 20)
        self.assertEqual(data['latest']['total'], 100)
        self.assertIsNone(data['latest']['snapshotDate'])
        self.assertEqual(data['latest']['datePrecision'], 'year')

    def test_previous_year_is_official_december_snapshot(self):
        raw = fixture(2025) + fixture(2026).split(b'\r\n', 1)[1]
        self.assertEqual(parse_counts(raw, 2026)[0]['snapshotDate'], '2025-12-31')
        self.assertIsNone(parse_counts(fixture(2025), 2026)[0]['snapshotDate'])

    def test_invalid_missing_duplicate_and_changed_categories_fail_closed(self):
        raw = fixture()
        cases = [raw.replace(b'2026,New,10%,10', b'2026,New,10%,'),
                 raw + b'2026,New,10%,10\r\n',
                 raw.replace(b'2026,New,10%,10\r\n', b''),
                 raw.replace(b'New', b'Unreviewed'),
                 raw.replace(b'10%,10', b'10%,11'),
                 fixture(2027)]
        for case in cases:
            with self.subTest(case=case):
                with self.assertRaises(ValueError): parse_counts(case, 2026)

    def test_content_hash_does_not_depend_on_retrieval_day(self):
        self.assertEqual(build(fixture(), '2026-10-19T00:00:00Z')['dataVersion'],
                         build(fixture(), '2026-10-20T00:00:00Z')['dataVersion'])

    def test_offline_reuses_verified_retrieval_date_and_rejects_unverified_cache(self):
        raw = fixture()
        prior = build(raw, '2026-10-19T00:00:00Z')
        stamp = offline_retrieved_at(raw, previous=prior)
        self.assertEqual(stamp, '2026-10-19T00:00:00Z')
        self.assertEqual(build(raw, stamp), prior)
        metadata = {'sha256': prior['source']['sha256'], 'retrievedAt': stamp}
        self.assertEqual(offline_retrieved_at(raw, metadata), stamp)
        for bad in [None, {}, {'sha256': 'bad', 'retrievedAt': stamp},
                    {'sha256': prior['source']['sha256'], 'retrievedAt': 'not a date'}]:
            with self.subTest(metadata=bad):
                with self.assertRaises(ValueError): offline_retrieved_at(raw, bad)


if __name__ == '__main__': unittest.main()
