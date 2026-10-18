"""Refresh BCER optional infrastructure as one validated, atomic weekly group."""
import argparse,datetime,hashlib,json,os,pathlib,shutil,tempfile,uuid
from concurrent.futures import ThreadPoolExecutor
import bcer_acquire,bcer_normalize,bcer_generalize
FILES=('map.geojson','full.geojson','orphan-pipelines.json')
LICENCE='https://www.bc-er.ca/files/gis/BCER-Open-Data-Licence.pdf'
COUNTS=('pipeline-permit','facility-permit','orphan-pipeline-row')
UTC=datetime.timezone.utc

def parse_date(value):
 result=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
 if result.tzinfo is None:raise ValueError('Acquisition dates must include a timezone')
 return result

def verify_group(directory,now=None):
 now=now or datetime.datetime.now(UTC)
 manifest=json.loads((directory/'manifest.json').read_text())
 if manifest.get('schemaVersion')!=1 or set(manifest.get('files',{}))!=set(FILES):raise ValueError('Invalid BCER manifest files/schema')
 if set(manifest.get('counts',{}))!=set(COUNTS):raise ValueError('Invalid BCER counts')
 for value in manifest['counts'].values():
  if type(value)!=int or value<1:raise ValueError('BCER source returned no records')
 for name in FILES:
  raw=(directory/name).read_bytes();expected=manifest['files'][name]
  if len(raw)!=expected['bytes'] or hashlib.sha256(raw).hexdigest()!=expected['sha256']:raise ValueError('BCER cached file integrity failed: '+name)
 sources=manifest.get('sources',{})
 if set(sources)!=set(bcer_acquire.SOURCES):raise ValueError('BCER source provenance incomplete')
 expectedCounts={'pipeline-permit':sources['pipelines']['recordCount'],'facility-permit':sources['facilities']['recordCount'],'orphan-pipeline-row':sources['orphan-pipelines']['recordCount']}
 if manifest['counts']!=expectedCounts:raise ValueError('BCER count provenance mismatch')
 full=json.loads((directory/'full.geojson').read_text());display=json.loads((directory/'map.geojson').read_text());orphans=json.loads((directory/'orphan-pipelines.json').read_text())
 fullIds=[f['id'] for f in full['features']];displayIds=[f['id'] for f in display['features']]
 if len(fullIds)!=len(set(fullIds)) or sorted(fullIds)!=sorted(displayIds):raise ValueError('BCER display identities differ from full records')
 actual={kind:sum(f['properties']['kind']==kind for f in full['features']) for kind in COUNTS[:2]};actual['orphan-pipeline-row']=len(orphans['rows'])
 if actual!=manifest['counts']:raise ValueError('BCER asset counts differ from manifest')
 if any(f['properties'].get('operatingStatus') is not None for f in full['features']+display['features']):raise ValueError('BCER permits cannot establish operations')
 dates=[]
 for name,source in sources.items():
  if source.get('license')!=LICENCE or source.get('sourceUrl')!=bcer_acquire.BASE+bcer_acquire.SOURCES[name][0]:raise ValueError('BCER source/licence mismatch')
  date=parse_date(source['retrievedAt']);dates.append(date)
  if date>now+datetime.timedelta(minutes=5):raise ValueError('BCER source date is in the future')
 if parse_date(manifest['retrievedAt'])!=min(dates):raise ValueError('BCER oldest acquisition date is not preserved')
 return manifest

def check_counts(previous,current):
 if previous:
  for name in COUNTS:
   if current[name]<previous['counts'][name]*.95:raise ValueError('BCER '+name+' count fell more than 5%; review before replacement')

def build_group(stage):
 raw=stage/'_acquisition';raw.mkdir()
 bcer_acquire.ROOT=raw;bcer_normalize.ROOT=raw;bcer_generalize.ROOT=raw
 with ThreadPoolExecutor(max_workers=3) as pool:sourceProof=dict(pool.map(lambda item:bcer_acquire.acquire(*item),bcer_acquire.SOURCES.items()))
 (raw/'BCER-ACQUISITION.json').write_text(json.dumps(sourceProof,indent=2))
 bcer_normalize.run();bcer_generalize.run()
 for name,original in [('map.geojson','bc-permitted-map.geojson'),('full.geojson','bc-permitted-infrastructure.geojson'),('orphan-pipelines.json','bc-orphan-pipeline-sites.json')]:shutil.copyfile(raw/original,stage/name)
 proof=json.loads((raw/'BCER-VERIFIED.json').read_text());mapProof=json.loads((raw/'BCER-MAP-VERIFIED.json').read_text())
 manifest={'schemaVersion':1,'retrievedAt':min(v['retrievedAt'] for v in sourceProof.values()),'builtAt':datetime.datetime.now(UTC).isoformat(),'counts':{**proof['counts'],'orphan-pipeline-row':proof['orphanTableRows']},'sources':sourceProof,'displayGeometry':{'method':'Douglas-Peucker','toleranceMetres':10,'projectedCRS':'EPSG:3005','maximumRemovedVertexDeviationMetres':mapProof['maxRemovedVertexDeviationM']},'scope':'Approved locations collected on or after July 11, 2016. Not a complete operating inventory. Source statuses are not independently verified operation. Orphan rows remain a separate ungeocoded table.','files':{}}
 for name in FILES:
  data=(stage/name).read_bytes();manifest['files'][name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 (stage/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');shutil.rmtree(raw)
 return manifest

def refresh(root,force=False,now=None,build=build_group):
 now=now or datetime.datetime.now(UTC);root=pathlib.Path(root);parent=root/'data';parent.mkdir(parents=True,exist_ok=True);target=parent/'bc-infrastructure'
 previous=verify_group(target,now) if target.exists() else None
 if previous and not force:
  age=(now-parse_date(previous['retrievedAt'])).total_seconds()
  if 0<=age<=7*24*60*60:
   print('BCER: retained verified weekly snapshot from '+previous['retrievedAt']);return {'refreshed':False,'manifest':previous}
 stage=pathlib.Path(tempfile.mkdtemp(prefix='.bc-infrastructure-',dir=parent));backup=parent/('.bc-infrastructure-backup-'+uuid.uuid4().hex)
 try:
  build(stage);current=verify_group(stage,now);check_counts(previous,current['counts'])
  if target.exists():os.replace(target,backup)
  try:os.replace(stage,target)
  except BaseException:
   if backup.exists():os.replace(backup,target)
   raise
  if backup.exists():shutil.rmtree(backup)
  return {'refreshed':True,'manifest':current}
 finally:
  if stage.exists():shutil.rmtree(stage)

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--root',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1]);parser.add_argument('--force',action='store_true');args=parser.parse_args()
 result=refresh(args.root,args.force);print(json.dumps({'refreshed':result['refreshed'],'counts':result['manifest']['counts'],'retrievedAt':result['manifest']['retrievedAt']}))
if __name__=='__main__':main()
