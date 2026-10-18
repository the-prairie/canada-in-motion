import importlib.util
import json
import hashlib
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('refresh',Path(__file__).with_name('refresh.py'))
refresh=importlib.util.module_from_spec(spec);spec.loader.exec_module(refresh)

class RefreshTests(unittest.TestCase):
    def row(self):
        return {'id':'source:1','sourceId':'source','province':'AB','lon':-110,'lat':53,'closureStatus':'unknown','orphanStatus':'unknown','events':[]}
    def test_rejects_missing_duplicate_and_invalid_records(self):
        source={'id':'source','province':'AB'}
        for rows in [[],[self.row(),self.row()],[{**self.row(),'lon':0}],[{**self.row(),'closureStatus':'invented'}]]:
            with self.assertRaises(ValueError):refresh.validate(rows,source)
    def test_count_drop_requires_review(self):
        with self.assertRaises(ValueError):refresh.validate([self.row()],{'id':'source','province':'AB'},100)
    def test_failure_keeps_previous_release(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for sub in ['data','config','pipeline']:(root/sub).mkdir()
            catalog=b'{"releaseId":"previous","sources":[]}'
            (root/'data/catalog.json').write_bytes(catalog)
            (root/'config/publication.json').write_text(json.dumps({'purpose':'noncommercial','maxCountDecreaseFraction':.05}))
            (root/'config/sources.json').write_text(json.dumps([{'id':'source','publication':'open','enabled':True,'format':'arcgis'}]))
            (root/'pipeline/adapters.py').write_text('def normalize(source, feature): return feature\n')
            with patch.object(refresh,'arcgis',side_effect=ValueError('upstream changed')):
                with self.assertRaises(ValueError):refresh.refresh(root)
            self.assertEqual((root/'data/catalog.json').read_bytes(),catalog)
            report=json.loads((root/'data/refresh-report.json').read_text())
            self.assertEqual(report['status'],'failed')
            self.assertTrue(report['previousReleaseRetained'])
            self.assertEqual(list((root/'data').glob('.release-*')),[])
    def test_publication_rights_required(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'config').mkdir()
            (root/'config/publication.json').write_text('{}')
            (root/'config/sources.json').write_text(json.dumps([{'id':'restricted','enabled':True,'publication':'permission-required'}]))
            with self.assertRaisesRegex(ValueError,'No permitted'):refresh.refresh(root)
    def test_partial_run_cannot_replace_catalog(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'config').mkdir()
            (root/'config/publication.json').write_text('{}')
            (root/'config/sources.json').write_text(json.dumps([{'id':'source','enabled':True,'publication':'open'}]))
            with self.assertRaisesRegex(ValueError,'Partial refresh'):refresh.refresh(root,['source'])
    def test_resume_rejects_changed_definition_and_stale_retrieval_even_with_new_file_time(self):
        source={'id':'source','publication':'open','enabled':True,'format':'arcgis'}
        for digest,timestamp,expected in [('wrong',refresh.now(),'definition changed'),(hashlib.sha256(json.dumps(source,sort_keys=True).encode()).hexdigest(),'2020-01-01T00:00:00Z','timestamp is stale')]:
            with self.subTest(expected=expected),tempfile.TemporaryDirectory() as folder:
                root=Path(folder)
                for sub in ['data','config','pipeline','.data-cache']:(root/sub).mkdir()
                catalog=b'{"releaseId":"previous","sources":[]}'
                (root/'data/catalog.json').write_bytes(catalog)
                (root/'config/publication.json').write_text(json.dumps({'purpose':'noncommercial','maxCountDecreaseFraction':.05}))
                (root/'config/sources.json').write_text(json.dumps([source]))
                (root/'pipeline/adapters.py').write_text('def normalize(source, feature): return feature\n')
                (root/'.data-cache/source-acquisition.json').write_text(json.dumps({'definitionSha256':digest,'features':[self.row()],'evidence':{'retrievedAt':timestamp}}))
                with patch.dict(os.environ,{'CIM_RESUME':'1'}):
                    with self.assertRaisesRegex(ValueError,expected):refresh.refresh(root)
                self.assertEqual((root/'data/catalog.json').read_bytes(),catalog)

if __name__=='__main__':unittest.main()
