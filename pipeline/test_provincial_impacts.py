"""Tests for the reviewed-coefficient publisher; no network calls."""
import copy
import hashlib
import io
import json
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
import refresh_provincial_impacts as refresh


class ProvincialImpactRefreshTests(unittest.TestCase):
    def fixture_sources(self):
        sources = copy.deepcopy(refresh.SOURCES)
        for source in sources:
            source['sha256'] = hashlib.sha256(source['id'].encode()).hexdigest()
        return sources

    def test_reviewed_sources_are_required_and_content_version_is_stable(self):
        sources = self.fixture_sources()
        with tempfile.TemporaryDirectory() as folder, patch.object(refresh, 'SOURCES', sources):
            cache = Path(folder)
            for source in sources:
                (cache / source['filename']).write_bytes(source['id'].encode())
            (cache / 'network-verification.json').write_text(json.dumps({'retrievedAt': '2026-10-18T23:00:00Z', 'sourceHashes': {source['id']: source['sha256'] for source in sources}}))
            first = refresh.build(cache, offline=True, generated_at='2026-10-19T23:00:00Z')
            second = refresh.build(cache, offline=True, generated_at='2026-10-20T23:00:00Z')
            self.assertEqual(first['dataVersion'], second['dataVersion'])
            self.assertNotEqual(first['generatedAt'], second['generatedAt'])
            self.assertEqual(first['retrievedAt'], second['retrievedAt'])
            self.assertEqual(second['retrievedAt'], '2026-10-18T23:00:00Z')
            self.assertEqual(len(first['calibrations']), 4)
            self.assertTrue(all('filename' not in source for source in first['sources']))
            self.assertEqual({row['fiscalYear'] for row in first['calibrations']}, {'2026-27'})

    def test_verified_online_refresh_advances_freshness_without_changing_content_identity(self):
        sources = self.fixture_sources()
        payloads = {source['url']: source['id'].encode() for source in sources}
        with tempfile.TemporaryDirectory() as folder, patch.object(refresh, 'SOURCES', sources), patch.object(refresh, 'urlopen', side_effect=lambda request, **kwargs: io.BytesIO(payloads[request.full_url])) as download:
            cache = Path(folder)
            first = refresh.build(cache, generated_at='2026-10-19T23:00:00Z')
            second = refresh.build(cache, generated_at='2026-10-30T23:00:00Z', previous=first)
            self.assertEqual(download.call_count, 6)
            self.assertEqual(first['dataVersion'], second['dataVersion'])
            self.assertEqual(first['generatedAt'], second['generatedAt'])
            self.assertEqual(second['retrievedAt'], '2026-10-30T23:00:00Z')
            replay = refresh.build(cache, offline=True, generated_at='2026-11-20T23:00:00Z', previous=second)
            self.assertEqual(replay['retrievedAt'], second['retrievedAt'])
            self.assertEqual(replay['generatedAt'], second['generatedAt'])
            self.assertEqual(download.call_count, 6)
            (cache / 'network-verification.json').unlink()
            self.assertEqual(refresh.build(cache, offline=True, previous=second)['retrievedAt'], second['retrievedAt'])

    def test_offline_bytes_without_matching_verification_cannot_claim_freshness(self):
        sources = self.fixture_sources()
        with tempfile.TemporaryDirectory() as folder, patch.object(refresh, 'SOURCES', sources):
            cache = Path(folder)
            for source in sources:
                (cache / source['filename']).write_bytes(source['id'].encode())
            with self.assertRaisesRegex(ValueError, 'verification date unavailable'):
                refresh.build(cache, offline=True)
            (cache / 'network-verification.json').write_text(json.dumps({'retrievedAt': '2026-10-19T23:00:00Z', 'sourceHashes': {'wrong-source': 'a' * 64}}))
            with self.assertRaisesRegex(ValueError, 'verification date unavailable'):
                refresh.build(cache, offline=True)

    def test_changed_source_fails_without_relabelling_existing_calibration(self):
        sources = self.fixture_sources()
        with tempfile.TemporaryDirectory() as folder, patch.object(refresh, 'SOURCES', sources):
            cache = Path(folder)
            for source in sources:
                (cache / source['filename']).write_bytes(source['id'].encode())
            (cache / sources[0]['filename']).write_text('revised budget')
            with self.assertRaisesRegex(ValueError, 'Source integrity failed'):
                refresh.build(cache, offline=True)

    def test_exact_reviewed_price_units_and_sensitivity_signs(self):
        rows = {row['id']: row for row in refresh.CALIBRATIONS}
        self.assertEqual(rows['ab-wti-2026']['baselinePrice'], 60.5)
        self.assertEqual(rows['ab-wti-2026']['publishedImpactLow'] / rows['ab-wti-2026']['priceChangeUnit'], 680)
        self.assertEqual(rows['ab-gas-2026']['priceUnit'], 'CAD/GJ')
        self.assertEqual(rows['sk-wti-2026']['outcomeLabel'], 'Provincial oil revenue')
        self.assertEqual((rows['bc-gas-2026']['publishedImpactLow'], rows['bc-gas-2026']['publishedImpactHigh']), (150, 250))


if __name__ == '__main__':
    unittest.main()
