import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import monitor_sources

class MonitorTests(unittest.TestCase):
    def test_change_across_outage_preserves_last_successful_digest(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'config').mkdir();(root/'data').mkdir()
            (root/'config/transport-sources.json').write_text(json.dumps({'sources':[{'id':'tariff','url':'https://example.test/tariff'}]}))
            with patch.object(monitor_sources,'request',return_value=(b'old',{})):
                old=monitor_sources.monitor(root)['sources'][0]
            with patch.object(monitor_sources,'request',side_effect=OSError('outage')):
                failed=monitor_sources.monitor(root)['sources'][0]
            self.assertEqual(failed['sha256'],old['sha256'])
            self.assertEqual(failed['lastSuccessfulCheckAt'],old['lastSuccessfulCheckAt'])
            with patch.object(monitor_sources,'request',return_value=(b'changed',{})):
                changed=monitor_sources.monitor(root)['sources'][0]
            self.assertEqual(changed['status'],'changed-review-required')
            self.assertFalse(changed['promotesRates'])

if __name__=='__main__':unittest.main()
