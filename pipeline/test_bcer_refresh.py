import unittest,tempfile,pathlib,json,datetime,hashlib,copy
from refresh_bcer import refresh,check_counts,FILES,LICENCE,UTC
from bcer_acquire import SOURCES,BASE
NOW=datetime.datetime(2026,10,18,tzinfo=UTC)
def fixture(stage,date=NOW,counts=None):
 counts=counts or {'pipeline-permit':10,'facility-permit':10,'orphan-pipeline-row':10}
 full={'features':[{'id':kind+str(i),'properties':{'kind':kind,'operatingStatus':None}} for kind in ['pipeline-permit','facility-permit'] for i in range(counts[kind])]}
 for name,data in [('full.geojson',full),('map.geojson',full),('orphan-pipelines.json',{'rows':[{}]*counts['orphan-pipeline-row']})]:(stage/name).write_text(json.dumps(data))
 sources={name:{'sourceUrl':BASE+path,'license':LICENCE,'retrievedAt':date.isoformat(),'recordCount':counts[kind]} for (name,(path,item)),kind in zip(SOURCES.items(),['pipeline-permit','facility-permit','orphan-pipeline-row'])}
 m={'schemaVersion':1,'retrievedAt':date.isoformat(),'counts':counts,'sources':sources,'files':{}}
 for name in FILES:
  raw=(stage/name).read_bytes();m['files'][name]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
 (stage/'manifest.json').write_text(json.dumps(m));return m
class RefreshTests(unittest.TestCase):
 def setUp(self):self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name)
 def tearDown(self):self.temp.cleanup()
 def test_weekly_reuse_preserves_date_and_bytes(self):
  refresh(self.root,now=NOW,build=lambda s:fixture(s,NOW-datetime.timedelta(days=6)))
  target=self.root/'data/bc-infrastructure';before={p.name:p.read_bytes() for p in target.iterdir()}
  def forbidden(s):self.fail('fresh acquisition should not run inside seven days')
  result=refresh(self.root,now=NOW,build=forbidden);self.assertFalse(result['refreshed']);self.assertEqual(before,{p.name:p.read_bytes() for p in target.iterdir()})
 def test_stale_cache_refreshes(self):
  refresh(self.root,now=NOW,build=lambda s:fixture(s,NOW-datetime.timedelta(days=8)))
  result=refresh(self.root,now=NOW,build=lambda s:fixture(s,NOW));self.assertTrue(result['refreshed']);self.assertEqual(result['manifest']['retrievedAt'],NOW.isoformat())
 def test_acquisition_failure_retains_previous(self):
  refresh(self.root,now=NOW,build=fixture);path=self.root/'data/bc-infrastructure/manifest.json';before=path.read_bytes()
  def fail(stage):(stage/'map.geojson').write_text('partial');raise RuntimeError('upstream failed')
  with self.assertRaises(RuntimeError):refresh(self.root,force=True,now=NOW,build=fail)
  self.assertEqual(path.read_bytes(),before);self.assertEqual([p.name for p in path.parent.parent.iterdir()],['bc-infrastructure'])
 def test_count_drop_retains_previous(self):
  refresh(self.root,now=NOW,build=fixture);path=self.root/'data/bc-infrastructure/manifest.json';before=path.read_bytes()
  with self.assertRaisesRegex(ValueError,'count fell'):refresh(self.root,force=True,now=NOW,build=lambda s:fixture(s,counts={'pipeline-permit':9,'facility-permit':10,'orphan-pipeline-row':10}))
  self.assertEqual(before,path.read_bytes())
 def test_bad_hash_and_path_are_rejected(self):
  refresh(self.root,now=NOW,build=fixture);target=self.root/'data/bc-infrastructure';(target/'map.geojson').write_text('corrupt')
  with self.assertRaisesRegex(ValueError,'integrity'):refresh(self.root,now=NOW)
  fixture(target);m=json.loads((target/'manifest.json').read_text());m['files']['../outside']=m['files'].pop('map.geojson');(target/'manifest.json').write_text(json.dumps(m))
  with self.assertRaisesRegex(ValueError,'files/schema'):refresh(self.root,now=NOW)
 def test_oldest_date_is_required(self):
  refresh(self.root,now=NOW,build=fixture);target=self.root/'data/bc-infrastructure';m=json.loads((target/'manifest.json').read_text());m['sources']['pipelines']['retrievedAt']=(NOW-datetime.timedelta(days=8)).isoformat();(target/'manifest.json').write_text(json.dumps(m))
  with self.assertRaisesRegex(ValueError,'oldest'):refresh(self.root,now=NOW)
if __name__=='__main__':unittest.main()
