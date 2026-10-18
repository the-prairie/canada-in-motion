import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from open_transport import fetch
from refresh_context import CONTEXT_FILES, refresh_context

class ContextRefreshTests(unittest.TestCase):
    def baseline(self, root):
        target = root / 'data/context'
        target.mkdir(parents=True)
        files = []
        for name in sorted(CONTEXT_FILES):
            payload = b'{}'
            (target / name).write_bytes(payload)
            files.append({'file': name, 'sha256': hashlib.sha256(payload).hexdigest()})
        manifest = {'retrievedAt': datetime.now(timezone.utc).isoformat(), 'files': files, 'counts': {'fixture': 1}}
        (target / 'manifest.json').write_text(json.dumps(manifest))
        return target, manifest

    def test_weekly_reuse_preserves_acquisition_timestamp(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target, manifest = self.baseline(root)
            before = (target / 'manifest.json').read_bytes()
            with patch('refresh_context.run', side_effect=AssertionError('Unexpected acquisition')):
                result = refresh_context(root)
            self.assertTrue(result['reusedVerifiedSnapshot'])
            self.assertEqual(result['retrievedAt'], manifest['retrievedAt'])
            self.assertEqual((target / 'manifest.json').read_bytes(), before)

    def test_failed_acquisition_retains_previous_group(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target, _ = self.baseline(root)
            before = {p.name: p.read_bytes() for p in target.iterdir()}
            with patch('refresh_context.run', side_effect=RuntimeError('Upstream unavailable')):
                with self.assertRaisesRegex(RuntimeError, 'Upstream unavailable'):
                    refresh_context(root, force=True)
            self.assertEqual({p.name: p.read_bytes() for p in target.iterdir()}, before)

    def test_cache_tamper_and_unexpected_paths_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target, manifest = self.baseline(root)
            (target / manifest['files'][0]['file']).write_text('tampered')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                refresh_context(root)
            manifest['files'][0]['file'] = '../catalog.json'
            (target / 'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'Unexpected'):
                refresh_context(root)

    def test_old_research_cache_cannot_be_relabelled_fresh(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'source.csv'
            path.write_text('old data')
            old = time.time() - 5 * 3600
            os.utime(path, (old, old))
            with self.assertRaisesRegex(ValueError, 'older than four hours'):
                fetch('https://example.invalid/source.csv', path, True)

if __name__ == '__main__':
    unittest.main()
